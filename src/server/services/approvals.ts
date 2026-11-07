import { randomUUID } from 'node:crypto';
import { evaluate } from '@/core/policy/evaluate';
import { decrypt } from '@/core/security/crypto';
import { signApprovalToken, verifyApprovalToken, type ApprovalBinding } from '@/core/security/tokens';
import { verifyTotp } from '@/core/security/totp';
import { assertInvoiceTransition } from '@/core/state-machine';
import type { Proposal, VendorFacts } from '@/core/types';
import { one, pool, tx, type Db } from '../db';
import { env } from '../env';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { audit } from '../repos/audit';
import { decideApproval, getApproval, setNonce } from '../repos/approvals';
import { paidAmounts, setInvoiceStatus } from '../repos/invoices';
import { getMandate } from '../repos/mandates';
import { getVendor } from '../repos/vendors';
import { getKillSwitch } from '../repos/flags';
import { committedCents, paymentsLastHour } from '../repos/payments';
import type { User } from '../repos/users';
import { enqueuePayment } from './payments';

interface Loaded {
  invoice: { id: string; mandate_id: string; vendor_id: string | null; amount_cents: string; currency: string; submitted_by: string; submitted_by_kind: string; status: string; vendor_name: string | null; invoice_number: string | null; extracted: unknown; raw_enc: string | null };
  decision: { id: string; decision_hash: string; proposal: Proposal; vendor_facts: VendorFacts; reasons: unknown; explanation: string | null; trace: unknown };
}

async function load(db: Db, approvalId: string): Promise<Loaded & { approval: NonNullable<Awaited<ReturnType<typeof getApproval>>> }> {
  const approval = await getApproval(db, approvalId);
  if (!approval) throw notFound('Approval not found');
  const invoice = await one<Loaded['invoice']>(db, 'select * from invoices where id=$1', [approval.invoiceId]);
  const decision = await one<Loaded['decision']>(db, 'select * from decisions where invoice_id=$1', [approval.invoiceId]);
  if (!invoice || !decision) throw notFound('Invoice not found');
  return { approval, invoice, decision };
}

const bindingFor = (l: Loaded, approvalId: string, userId: string): ApprovalBinding => ({
  approvalId, invoiceId: l.invoice.id, vendorId: l.invoice.vendor_id, amountCents: Number(l.invoice.amount_cents),
  currency: l.invoice.currency.trim(), decisionHash: l.decision.decision_hash, userId,
});

/** What the approver sees, plus a fresh one-time token bound to exactly this content. */
export async function openApproval(approvalId: string, user: User) {
  return tx(async (db) => {
    const l = await load(db, approvalId);
    if (l.approval.status !== 'pending') throw conflict(`This approval was already ${l.approval.status}`);
    const nonce = randomUUID();
    await setNonce(db, approvalId, nonce);
    const token = signApprovalToken(env().approvalSecret, bindingFor(l, approvalId, user.id), nonce);
    const vendor = l.invoice.vendor_id ? await getVendor(db, l.invoice.vendor_id) : null;
    const amount = Number(l.invoice.amount_cents);
    return {
      token,
      needsStepUp: env().requireTotp && !env().demoMode && amount >= env().stepUpCents,
      makerChecker: l.invoice.submitted_by_kind === 'user' && l.invoice.submitted_by === user.id,
      invoiceId: l.invoice.id, vendorName: vendor?.name ?? l.invoice.vendor_name, payeeEmailMasked: vendor?.payeeEmailMasked ?? null,
      amountCents: amount, currency: l.invoice.currency.trim(), invoiceNumber: l.invoice.invoice_number,
      reasons: l.decision.reasons, trace: l.decision.trace, explanation: l.decision.explanation,
    };
  });
}

export async function decide(approvalId: string, user: User, input: { action: 'approve' | 'reject'; token: string; note: string | null; totp?: string }) {
  return tx(async (db) => {
    const approval = await getApproval(db, approvalId, true); // row lock: double-click safe
    if (!approval) throw notFound('Approval not found');
    if (approval.status !== 'pending') throw conflict(`This approval was already ${approval.status}`);
    const l = await load(db, approvalId);

    // Separation of duties: nobody approves what they submitted themselves.
    if (l.invoice.submitted_by_kind === 'user' && l.invoice.submitted_by === user.id) throw forbidden('You submitted this invoice, so someone else must approve it');

    const check = verifyApprovalToken(env().approvalSecret, input.token, bindingFor(l, approvalId, user.id));
    if (!check.ok) throw badRequest(check.reason);
    if (approval.tokenUsed || approval.tokenNonce !== check.nonce) throw conflict('This approval link was already used or replaced. Reload the page');

    const amount = Number(l.invoice.amount_cents);
    if (input.action === 'approve' && env().requireTotp && !env().demoMode && amount >= env().stepUpCents) {
      const secret = user.totpSecretEnc ? decrypt(user.totpSecretEnc, env().encryptionKey) : null;
      if (!secret || !input.totp || !verifyTotp(secret, input.totp)) throw forbidden('Enter a valid authenticator code to approve a payment this size');
    }

    if (input.action === 'reject') {
      assertInvoiceTransition('AWAITING_APPROVAL', 'REJECTED');
      await decideApproval(db, approvalId, 'rejected', user.id, input.note);
      await setInvoiceStatus(db, l.invoice.id, 'REJECTED');
      await audit(db, { actorKind: 'user', actorId: user.id, action: 'APPROVAL_REJECTED', subjectType: 'invoice', subjectId: l.invoice.id, detail: { approvalId } });
      return { status: 'rejected' as const };
    }

    // Approve: re-run the policy against TODAY's world with the escalations lifted.
    // Denials (budget used up since, kill switch, expiry...) still apply.
    const mandate = await getMandate(db, l.invoice.mandate_id, { lock: true });
    if (!mandate) throw notFound('Mandate not found');
    const vendor = l.invoice.vendor_id ? await getVendor(db, l.invoice.vendor_id) : null;
    const paid = vendor ? await paidAmounts(db, vendor.id) : [];
    const decision = evaluate(l.decision.proposal, mandate, {
      now: new Date(), killSwitch: (await getKillSwitch(db)).engaged, approved: true,
      vendor: vendor ? { status: vendor.status, allowlisted: mandate.vendorIds.includes(vendor.id), priorPaidCount: paid.length } : l.decision.vendor_facts,
      spentThisPeriodCents: await committedCents(db, mandate.id), paymentsLastHour: await paymentsLastHour(db, mandate.id),
    });
    if (decision.verdict !== 'ALLOW' || !vendor) {
      throw conflict('This payment can no longer be approved', { reasons: decision.reasons.map((r) => r.detail) });
    }

    assertInvoiceTransition('AWAITING_APPROVAL', 'PAYMENT_PENDING');
    await decideApproval(db, approvalId, 'approved', user.id, input.note);
    await setInvoiceStatus(db, l.invoice.id, 'PAYMENT_PENDING');
    await audit(db, { actorKind: 'user', actorId: user.id, action: 'APPROVAL_GRANTED', subjectType: 'invoice', subjectId: l.invoice.id, detail: { approvalId, amountCents: amount } });
    await enqueuePayment(db, { invoiceId: l.invoice.id, mandateId: mandate.id, vendorId: vendor.id, amountCents: amount, currency: l.invoice.currency.trim() }, { kind: 'user', id: user.id });
    return { status: 'approved' as const };
  });
}

export const pendingCount = async () => Number((await one<{ c: string }>(pool(), `select count(*) c from approvals where status='pending'`))!.c);

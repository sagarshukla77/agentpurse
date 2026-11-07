import { canMovePayment, fromPayPalItemStatus, paymentToInvoiceStatus, assertInvoiceTransition } from '@/core/state-machine';
import type { InvoiceStatus, PaymentStatus } from '@/core/types';
import { formatMoney } from '@/core/money';
import { getBatchItems, getItem, submitPayout } from '@/paypal/payouts';
import { one, pool, tx, type Db } from '../db';
import { env } from '../env';
import { conflict, notFound } from '../errors';
import { audit } from '../repos/audit';
import { getKillSwitch } from '../repos/flags';
import { setInvoiceStatus } from '../repos/invoices';
import { awaitingSettlement, claimDue, getPayment, getPaymentByInvoice, insertPayment, staleSubmitting, updatePayment, type Payment } from '../repos/payments';
import { getVendor } from '../repos/vendors';
import { notify } from './notify';

/** Called inside the decision transaction: the money intent is committed atomically with the decision. */
export async function enqueuePayment(db: Db, p: { invoiceId: string; mandateId: string; vendorId: string; amountCents: number; currency: string }, actor: { kind: 'user' | 'agent' | 'system'; id: string | null }): Promise<Payment> {
  const payment = await insertPayment(db, { ...p, holdSeconds: env().holdSeconds });
  await audit(db, { actorKind: actor.kind, actorId: actor.id, action: 'PAYMENT_QUEUED', subjectType: 'invoice', subjectId: p.invoiceId, detail: { paymentId: payment.id, amountCents: p.amountCents, releaseAt: payment.releaseAt.toISOString() } });
  return payment;
}

/** Cancel during the hold window. Once the worker has claimed it, it is too late. */
export async function cancelPayment(invoiceId: string, actor: { id: string }): Promise<void> {
  await tx(async (db) => {
    const pay = await getPaymentByInvoice(db, invoiceId, true);
    if (!pay) throw notFound('No payment for this invoice');
    if (pay.status !== 'QUEUED') throw conflict(`Too late to cancel: payment is ${pay.status.toLowerCase()}`);
    await updatePayment(db, pay.id, { status: 'CANCELED' });
    assertInvoiceTransition('PAYMENT_PENDING', 'CANCELED');
    await setInvoiceStatus(db, invoiceId, 'CANCELED');
    await audit(db, { actorKind: 'user', actorId: actor.id, action: 'PAYMENT_CANCELED', subjectType: 'invoice', subjectId: invoiceId, detail: { paymentId: pay.id } });
  });
}

/** Moves a payment forward (never backward) and keeps the invoice status in step. Idempotent. */
export async function applyPaymentStatus(db: Db, paymentId: string, next: PaymentStatus, why: { source: string; error?: string | null; itemId?: string | null; batchId?: string | null }): Promise<boolean> {
  const cur = await getPayment(db, paymentId, true);
  if (!cur || cur.status === next || !canMovePayment(cur.status, next)) return false;
  await updatePayment(db, cur.id, { status: next, lastError: why.error ?? null, paypalItemId: why.itemId, paypalBatchId: why.batchId });
  const invStatus = paymentToInvoiceStatus(next);
  if (invStatus) {
    assertInvoiceTransition('PAYMENT_PENDING', invStatus as InvoiceStatus);
    await setInvoiceStatus(db, cur.invoiceId, invStatus);
  }
  await audit(db, { actorKind: why.source === 'paypal' ? 'paypal' : 'system', action: `PAYMENT_${next}`, subjectType: 'invoice', subjectId: cur.invoiceId, detail: { paymentId: cur.id, from: cur.status, source: why.source, ...(why.error ? { error: why.error } : {}) } });
  if (next === 'FAILED' || next === 'BLOCKED' || next === 'RETURNED') {
    void notify({ severity: 'critical', title: `Payment ${next.toLowerCase()}`, body: `${formatMoney(cur.amountCents, cur.currency)} (invoice ${cur.invoiceId}). Budget has been released.` });
  }
  return true;
}

/** Outbox worker. Safe to run in several processes at once; every step is retry-safe. */
export async function processDue(limit = 5): Promise<{ claimed: number }> {
  const claimed = await tx((db) => claimDue(db, limit));
  for (const p of claimed) await submitOne(p).catch((e) => console.error('payment submit crashed', p.id, e));
  return { claimed: claimed.length };
}

async function submitOne(p: Payment): Promise<void> {
  // Last-moment kill-switch check, in the worker itself: nothing leaves while frozen.
  if ((await getKillSwitch(pool())).engaged) {
    await tx(async (db) => {
      await updatePayment(db, p.id, { status: 'QUEUED', releaseInSeconds: 30, lastError: 'Held by kill switch' });
      await db.query('update payments set attempts = greatest(attempts-1,0) where id=$1', [p.id]);
      await audit(db, { actorKind: 'system', action: 'PAYMENT_HELD_BY_KILL_SWITCH', subjectType: 'invoice', subjectId: p.invoiceId, detail: { paymentId: p.id } });
    });
    return;
  }

  const vendor = await getVendor(pool(), p.vendorId);
  if (!vendor || vendor.status !== 'verified') {
    await tx((db) => applyPaymentStatus(db, p.id, 'FAILED', { source: 'worker', error: 'Vendor is no longer verified' }));
    return;
  }

  // The destination comes ONLY from the verified registry record, never from the invoice.
  const outcome = await submitPayout({
    senderBatchId: p.senderBatchId, requestId: p.idempotencyKey, receiver: vendor.payeeEmail,
    amountCents: p.amountCents, currency: p.currency, senderItemId: p.id, note: `Invoice ${p.invoiceId.slice(0, 8)}`,
  });

  await tx(async (db) => {
    switch (outcome.kind) {
      case 'accepted':
      case 'duplicate':
        await applyPaymentStatus(db, p.id, 'SUBMITTED', { source: 'worker', batchId: outcome.batchId });
        break;
      case 'rejected':
        await applyPaymentStatus(db, p.id, 'FAILED', { source: 'worker', error: outcome.message });
        break;
      case 'unknown':
        // We cannot tell whether PayPal got it. Retrying with the SAME ids is safe: PayPal de-duplicates.
        await updatePayment(db, p.id, { status: 'UNKNOWN', lastError: outcome.message, releaseInSeconds: 30 * p.attempts });
        await audit(db, { actorKind: 'system', action: 'PAYMENT_OUTCOME_UNKNOWN', subjectType: 'invoice', subjectId: p.invoiceId, detail: { paymentId: p.id, attempt: p.attempts } });
        break;
    }
  });
}

/** Reads the authoritative state from PayPal for one payment and applies it. */
export async function syncFromPayPal(p: Payment): Promise<void> {
  if (!p.paypalBatchId && !p.paypalItemId) return;
  const items = p.paypalItemId ? [await getItem(p.paypalItemId)] : await getBatchItems(p.paypalBatchId!);
  const item = items.find((i) => i.senderItemId === p.id) ?? items[0];
  if (!item) return;
  const next = fromPayPalItemStatus(item.status);
  await tx(async (db) => {
    if (next) await applyPaymentStatus(db, p.id, next, { source: 'paypal', itemId: item.payoutItemId, error: item.errorMessage });
    else await db.query('update payments set paypal_item_id=$2 where id=$1', [p.id, item.payoutItemId]);
  });
}

/**
 * Reconciliation: heals anything the happy path missed.
 *  - payments stuck mid-flight (worker crashed) go back to UNKNOWN and are retried with the same ids
 *  - submitted payments are re-read from PayPal in case a webhook never arrived
 */
export async function reconcile(): Promise<{ recovered: number; synced: number }> {
  const stale = await tx(async (db) => {
    const rows = await staleSubmitting(db);
    for (const p of rows) {
      await updatePayment(db, p.id, { status: 'UNKNOWN', lastError: 'Recovered after worker interruption', releaseInSeconds: 0 });
      await audit(db, { actorKind: 'system', action: 'PAYMENT_RECOVERED', subjectType: 'invoice', subjectId: p.invoiceId, detail: { paymentId: p.id } });
    }
    return rows.length;
  });
  const pending = await awaitingSettlement(pool());
  let synced = 0;
  for (const p of pending) { await syncFromPayPal(p).then(() => { synced++; }).catch((e) => console.error('sync failed', p.id, e)); }
  return { recovered: stale, synced };
}

export async function paymentStatusForInvoice(invoiceId: string) {
  return one<{ status: PaymentStatus }>(pool(), 'select status from payments where invoice_id=$1', [invoiceId]);
}

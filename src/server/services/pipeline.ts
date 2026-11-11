import type { ExtractedInvoice, InvoiceStatus, RuleResult, Verdict } from '@/core/types';
import { underwrite } from '@/core/underwrite';
import { canonical } from '@/core/audit/chain';
import { detectInjection, type InjectionResult } from '@/core/risk/injection';
import { encrypt, sha256 } from '@/core/security/crypto';
import { maskEmail, matchVendor } from '@/core/vendors';
import { extractInvoice } from '@/ai/extract';
import { explainDecision } from '@/ai/explain';
import { tx } from '../db';
import { env } from '../env';
import { notFound } from '../errors';
import { audit } from '../repos/audit';
import { insertApproval } from '../repos/approvals';
import { insertDecision, insertInvoice, setExplanation } from '../repos/invoices';
import { getMandate } from '../repos/mandates';
import { listVendors } from '../repos/vendors';
import { enqueuePayment } from './payments';
import { notify } from './notify';
import { loadWorld } from './world';
import { formatMoney } from '@/core/money';

export interface Actor { kind: 'user' | 'agent'; id: string; label: string }
export interface StructuredRequest { vendorName: string; amountCents: number; currency: string; reference: string; description?: string }
export interface IngestRequest {
  actor: Actor; mandateId: string; source: 'paste' | 'upload' | 'agent' | 'fixture';
  text?: string; file?: { mime: string; base64: string }; structured?: StructuredRequest;
}
export interface IngestResult {
  invoiceId: string; status: InvoiceStatus; verdict: Verdict | 'NEEDS_REVIEW';
  reasons: Pick<RuleResult, 'code' | 'detail'>[]; approvalId?: string; explanation?: string;
}

/**
 * ingest → extract (no authority) → risk checks → policy engine (the only authority) → record.
 * The decision and, for ALLOW, the payment intent are written in ONE transaction under a row lock
 * on the mandate, so concurrent requests can never overspend a budget.
 */
export async function ingestInvoice(req: IngestRequest): Promise<IngestResult> {
  const now = new Date();
  const s = req.structured;
  const rawBytes = req.file ? Buffer.from(req.file.base64, 'base64') : null;
  const contentHash = sha256(rawBytes ?? (s ? `agent:${req.actor.id}:${s.reference}:${s.vendorName}:${s.amountCents}:${s.currency}` : (req.text ?? '')));
  const probe = s ? `${s.vendorName}\n${s.reference}\n${s.description ?? ''}` : (req.text ?? '');

  // ---- 1. Extraction (AI, untrusted output) ----
  let extracted: ExtractedInvoice | null = null;
  let llmInjection: InjectionResult = { flagged: false, evidence: [] };
  let parser: 'ai' | 'offline' = 'ai';
  let fallbackReason: string | undefined;
  let extractionError = '';
  try {
    if (s) {
      extracted = { vendorName: s.vendorName, vendorEmail: null, invoiceNumber: s.reference, amountCents: s.amountCents, currency: s.currency, dueDate: null, lineItems: [], confidence: 1 };
    } else {
      const r = await extractInvoice({ text: req.text, file: req.file });
      extracted = r.invoice; llmInjection = r.injection; parser = r.parser; fallbackReason = r.fallbackReason;
    }
  } catch (e) { extractionError = e instanceof Error ? e.message : 'extraction failed'; }

  const rawEnc = encrypt(JSON.stringify(req.file ? { kind: 'file', mime: req.file.mime, base64: req.file.base64 } : { kind: 'text', text: req.text ?? probe }), env().encryptionKey);

  // Fail closed: if we cannot read it reliably, a human looks at it. We never guess.
  if (!extracted) {
    const id = await tx(async (db) => {
      const invoiceId = await insertInvoice(db, { mandateId: req.mandateId, source: req.source, submittedByKind: req.actor.kind, submittedBy: req.actor.id, contentHash, rawEnc, vendorId: null, vendorName: null, invoiceNumber: null, amountCents: null, currency: null, dueDate: null, extracted: null, status: 'NEEDS_REVIEW' });
      await audit(db, { actorKind: req.actor.kind, actorId: req.actor.id, action: 'INVOICE_UNREADABLE', subjectType: 'invoice', subjectId: invoiceId, detail: { source: req.source, error: extractionError.slice(0, 200) } });
      return invoiceId;
    });
    return { invoiceId: id, status: 'NEEDS_REVIEW', verdict: 'NEEDS_REVIEW', reasons: [{ code: 'LOW_CONFIDENCE', detail: `Could not read this document: ${extractionError}` }] };
  }

  // ---- 2. Injection screening: heuristics on the text, plus the AI's own flag from the same call ----
  const heuristic = detectInjection(probe);
  const injection: InjectionResult = { flagged: heuristic.flagged || llmInjection.flagged, evidence: [...heuristic.evidence, ...llmInjection.evidence] };

  // ---- 3 + 4. Risk + policy, atomically, under the mandate lock ----
  const outcome = await tx(async (db) => {
    const mandate = await getMandate(db, req.mandateId, { lock: true });
    if (!mandate) throw notFound('Mandate not found');
    const vendors = await listVendors(db);
    const vendor = matchVendor(extracted!.vendorName, vendors);
    const world = await loadWorld(db, mandate, vendor);

    const { proposal, decision } = underwrite({
      extracted: extracted!, contentHash, vendor: vendor ? { id: vendor.id, payeeEmail: vendor.payeeEmail } : null, vendorFacts: world.vendorFacts,
      injection, history: world.history, paidHistoryCents: world.paidHistoryCents, mandate, killSwitch: world.killSwitch,
      spentThisPeriodCents: world.spentCents, paymentsLastHour: world.paymentsLastHour, now,
    });

    const status: InvoiceStatus = decision.verdict === 'ALLOW' ? 'PAYMENT_PENDING' : decision.verdict === 'ESCALATE' ? 'AWAITING_APPROVAL' : 'REJECTED';
    const invoiceId = await insertInvoice(db, {
      mandateId: mandate.id, source: req.source, submittedByKind: req.actor.kind, submittedBy: req.actor.id, contentHash, rawEnc,
      vendorId: vendor?.id ?? null, vendorName: extracted!.vendorName, invoiceNumber: extracted!.invoiceNumber, amountCents: extracted!.amountCents,
      currency: extracted!.currency, dueDate: extracted!.dueDate,
      extracted: { ...extracted, vendorEmail: extracted!.vendorEmail ? maskEmail(extracted!.vendorEmail) : null }, status,
    });
    const decisionHash = sha256(canonical({ verdict: decision.verdict, codes: decision.reasons.map((r) => r.code), proposal, v: decision.policyVersion }));
    await insertDecision(db, { invoiceId, verdict: decision.verdict, reasons: decision.reasons, trace: decision.trace, proposal, vendorFacts: world.vendorFacts, decisionHash, policyVersion: decision.policyVersion });

    const actor = { actorKind: req.actor.kind, actorId: req.actor.id } as const;
    await audit(db, { ...actor, action: 'INVOICE_RECEIVED', subjectType: 'invoice', subjectId: invoiceId, detail: { source: req.source, by: req.actor.label } });
    await audit(db, { actorKind: 'ai', action: 'INVOICE_EXTRACTED', subjectType: 'invoice', subjectId: invoiceId, detail: { confidence: extracted!.confidence, vendorMatched: !!vendor, amountCents: extracted!.amountCents, currency: extracted!.currency, parser, ...(fallbackReason ? { fallbackReason } : {}) } });
    await audit(db, { actorKind: 'system', action: 'RISK_ASSESSED', subjectType: 'invoice', subjectId: invoiceId, detail: { flags: proposal.riskFlags, injectionEvidence: injection.evidence } });
    await audit(db, { actorKind: 'system', action: 'POLICY_DECIDED', subjectType: 'invoice', subjectId: invoiceId, detail: { verdict: decision.verdict, reasons: decision.reasons.map((r) => r.code), policyVersion: decision.policyVersion } });

    let approvalId: string | undefined;
    if (decision.verdict === 'ALLOW' && vendor) {
      await enqueuePayment(db, { invoiceId, mandateId: mandate.id, vendorId: vendor.id, amountCents: extracted!.amountCents, currency: extracted!.currency }, { kind: 'system', id: null });
    } else if (decision.verdict === 'ESCALATE') {
      approvalId = (await insertApproval(db, invoiceId)).id;
      await audit(db, { actorKind: 'system', action: 'APPROVAL_REQUESTED', subjectType: 'invoice', subjectId: invoiceId, detail: { approvalId } });
    } else {
      await audit(db, { actorKind: 'system', action: 'INVOICE_REJECTED', subjectType: 'invoice', subjectId: invoiceId, detail: { reasons: decision.reasons.map((r) => r.code) } });
    }
    return { invoiceId, status, decision, approvalId };
  });

  // ---- 5. Plain-English explanation (describes the decision; cannot change it) ----
  const explanation = await explainDecision(outcome.decision);
  await setExplanation(outcome.invoiceId, explanation).catch(() => undefined);

  if (outcome.decision.verdict === 'ESCALATE') {
    void notify({ severity: 'warning', title: 'Approval needed', body: `${extracted.vendorName}: ${formatMoney(extracted.amountCents, extracted.currency)}. ${explanation}` });
  } else if (outcome.decision.verdict === 'DENY' && outcome.decision.reasons.some((r) => r.code === 'PROMPT_INJECTION')) {
    void notify({ severity: 'critical', title: 'Prompt-injection attempt blocked', body: `A document from "${extracted.vendorName}" tried to instruct the AI. No payment was made.` });
  }

  return {
    invoiceId: outcome.invoiceId, status: outcome.status, verdict: outcome.decision.verdict,
    reasons: outcome.decision.reasons.map((r) => ({ code: r.code, detail: r.detail })), approvalId: outcome.approvalId, explanation,
  };
}


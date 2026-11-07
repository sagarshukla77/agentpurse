import type { InvoiceStatus, Proposal, RuleResult, VendorFacts, Verdict } from '@/core/types';
import type { HistoryInvoice } from '@/core/risk/checks';
import type { StoredDecision } from '@/core/replay';
import { one, pool, q, type Db } from '../db';

export interface NewInvoice {
  mandateId: string; source: 'paste' | 'upload' | 'agent' | 'fixture'; submittedByKind: 'user' | 'agent'; submittedBy: string;
  contentHash: string; rawEnc: string | null; vendorId: string | null; vendorName: string | null; invoiceNumber: string | null;
  amountCents: number | null; currency: string | null; dueDate: string | null; extracted: unknown; status: InvoiceStatus;
}

export async function insertInvoice(db: Db, i: NewInvoice): Promise<string> {
  const r = await one<{ id: string }>(db,
    `insert into invoices (mandate_id,source,submitted_by_kind,submitted_by,content_hash,raw_enc,vendor_id,vendor_name,invoice_number,amount_cents,currency,due_date,extracted,status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
    [i.mandateId, i.source, i.submittedByKind, i.submittedBy, i.contentHash, i.rawEnc, i.vendorId, i.vendorName, i.invoiceNumber, i.amountCents, i.currency, i.dueDate, i.extracted ? JSON.stringify(i.extracted) : null, i.status]);
  return r!.id;
}

export const setInvoiceStatus = (db: Db, id: string, status: InvoiceStatus) =>
  db.query('update invoices set status=$2, updated_at=now() where id=$1', [id, status]);

export interface DecisionInput { invoiceId: string; verdict: Verdict; reasons: RuleResult[]; trace: RuleResult[]; proposal: Proposal; vendorFacts: VendorFacts; decisionHash: string; policyVersion: string }
export async function insertDecision(db: Db, d: DecisionInput): Promise<string> {
  const r = await one<{ id: string }>(db,
    `insert into decisions (invoice_id,verdict,reasons,trace,proposal,vendor_facts,decision_hash,policy_version)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [d.invoiceId, d.verdict, JSON.stringify(d.reasons), JSON.stringify(d.trace), JSON.stringify(d.proposal), JSON.stringify(d.vendorFacts), d.decisionHash, d.policyVersion]);
  return r!.id;
}
export const setExplanation = (invoiceId: string, text: string) =>
  pool().query('update decisions set explanation=$2 where invoice_id=$1', [invoiceId, text]);

/** Live invoices (not rejected/cancelled) from the last 60 days, for duplicate detection. */
export async function liveHistory(db: Db): Promise<HistoryInvoice[]> {
  const rows = await q<{ content_hash: string; vendor_id: string | null; invoice_number: string | null; amount_cents: string; created_at: Date }>(db,
    `select content_hash, vendor_id, invoice_number, amount_cents, created_at from invoices
     where created_at > now() - interval '60 days' and status in ('AWAITING_APPROVAL','PAYMENT_PENDING','PAID')`);
  return rows.map((r) => ({ contentHash: r.content_hash, vendorId: r.vendor_id, invoiceNumber: r.invoice_number, amountCents: Number(r.amount_cents), createdAt: r.created_at }));
}

export async function paidAmounts(db: Db, vendorId: string): Promise<number[]> {
  const rows = await q<{ amount_cents: string }>(db, `select amount_cents from invoices where vendor_id=$1 and status='PAID' order by created_at desc limit 50`, [vendorId]);
  return rows.map((r) => Number(r.amount_cents));
}

export async function listInvoices(limit = 500) {
  return q<Record<string, unknown>>(pool(),
    `select i.id, i.created_at, i.status, i.source, i.vendor_name, i.invoice_number, i.amount_cents, i.currency, i.submitted_by_kind,
            d.verdict, p.status as payment_status, v.name as vendor_registry_name
     from invoices i
     left join decisions d on d.invoice_id = i.id
     left join payments p on p.invoice_id = i.id
     left join vendors v on v.id = i.vendor_id
     order by i.created_at desc limit $1`, [limit]);
}

export async function getInvoiceDetail(id: string) {
  const invoice = await one<Record<string, unknown>>(pool(), `select i.*, v.name as vendor_registry_name from invoices i left join vendors v on v.id=i.vendor_id where i.id=$1`, [id]);
  if (!invoice) return null;
  const decision = await one<Record<string, unknown>>(pool(), 'select * from decisions where invoice_id=$1', [id]);
  const payment = await one<Record<string, unknown>>(pool(), 'select * from payments where invoice_id=$1', [id]);
  const approval = await one<Record<string, unknown>>(pool(), 'select * from approvals where invoice_id=$1', [id]);
  return { invoice, decision, payment, approval };
}

export async function decisionsForReplay(mandateId: string, days = 30): Promise<StoredDecision[]> {
  const rows = await q<{ id: string; created_at: Date; proposal: Proposal; vendor_facts: VendorFacts; verdict: Verdict }>(pool(),
    `select d.id, d.created_at, d.proposal, d.vendor_facts, d.verdict from decisions d join invoices i on i.id=d.invoice_id
     where i.mandate_id=$1 and d.created_at > now() - make_interval(days => $2::int) order by d.created_at`, [mandateId, days]);
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at, proposal: r.proposal, vendorFacts: r.vendor_facts, verdict: r.verdict }));
}

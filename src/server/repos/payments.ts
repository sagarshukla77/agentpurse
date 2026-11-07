import type { PaymentStatus } from '@/core/types';
import { BUDGET_CONSUMING } from '@/core/state-machine';
import { one, q, type Db } from '../db';

export interface Payment {
  id: string; invoiceId: string; mandateId: string; vendorId: string; amountCents: number; currency: string; status: PaymentStatus;
  senderBatchId: string; idempotencyKey: string; releaseAt: Date; attempts: number; paypalBatchId: string | null; paypalItemId: string | null; lastError: string | null;
}
interface Row {
  id: string; invoice_id: string; mandate_id: string; vendor_id: string; amount_cents: string; currency: string; status: PaymentStatus;
  sender_batch_id: string; idempotency_key: string; release_at: Date; attempts: number; paypal_batch_id: string | null; paypal_item_id: string | null; last_error: string | null;
}
export const mapPayment = (r: Row): Payment => ({
  id: r.id, invoiceId: r.invoice_id, mandateId: r.mandate_id, vendorId: r.vendor_id, amountCents: Number(r.amount_cents), currency: r.currency.trim(),
  status: r.status, senderBatchId: r.sender_batch_id, idempotencyKey: r.idempotency_key, releaseAt: r.release_at, attempts: r.attempts,
  paypalBatchId: r.paypal_batch_id, paypalItemId: r.paypal_item_id, lastError: r.last_error,
});

export async function insertPayment(db: Db, p: { invoiceId: string; mandateId: string; vendorId: string; amountCents: number; currency: string; holdSeconds: number }): Promise<Payment> {
  // Stable per-invoice identifiers: any retry, by anyone, reuses them, so PayPal can de-duplicate.
  // The explicit ::uuid casts matter: casting a bare parameter to ::text would make Postgres infer
  // conflicting types for the same parameter ("inconsistent types deduced for parameter $1").
  const r = await one<Row>(db,
    `insert into payments (invoice_id,mandate_id,vendor_id,amount_cents,currency,status,sender_batch_id,idempotency_key,release_at)
     values ($1::uuid, $2::uuid, $3::uuid, $4::bigint, $5, 'QUEUED',
             'ap_' || replace($1::uuid::text, '-', ''), 'ap-idem-' || $1::uuid::text,
             now() + make_interval(secs => $6::int))
     returning *`,
    [p.invoiceId, p.mandateId, p.vendorId, p.amountCents, p.currency, p.holdSeconds]);
  return mapPayment(r!);
}

export const getPayment = async (db: Db, id: string, lock = false) => {
  const r = await one<Row>(db, `select * from payments where id=$1 ${lock ? 'for update' : ''}`, [id]);
  return r ? mapPayment(r) : null;
};
export const getPaymentByInvoice = async (db: Db, invoiceId: string, lock = false) => {
  const r = await one<Row>(db, `select * from payments where invoice_id=$1 ${lock ? 'for update' : ''}`, [invoiceId]);
  return r ? mapPayment(r) : null;
};
export const getPaymentByItem = async (db: Db, itemId: string, senderItemId: string | null) => {
  const r = await one<Row>(db, 'select * from payments where paypal_item_id=$1 or ($2::text is not null and id::text=$2)', [itemId, senderItemId]);
  return r ? mapPayment(r) : null;
};

/** Money already committed against a mandate: everything that has not failed, been returned or been cancelled. */
export async function committedCents(db: Db, mandateId: string): Promise<number> {
  const r = await one<{ s: string }>(db, 'select coalesce(sum(amount_cents),0) as s from payments where mandate_id=$1 and status = any($2)', [mandateId, BUDGET_CONSUMING]);
  return Number(r!.s);
}
export async function paymentsLastHour(db: Db, mandateId: string): Promise<number> {
  const r = await one<{ c: string }>(db, `select count(*) as c from payments where mandate_id=$1 and status = any($2) and created_at > now() - interval '1 hour'`, [mandateId, BUDGET_CONSUMING]);
  return Number(r!.c);
}

/** Worker claim. SKIP LOCKED lets several workers run safely side by side. */
export async function claimDue(db: Db, limit: number): Promise<Payment[]> {
  const rows = await q<Row>(db,
    `update payments set status='SUBMITTING', attempts=attempts+1, updated_at=now()
     where id in (select id from payments where status in ('QUEUED','UNKNOWN') and release_at <= now() and attempts < 6
                  order by release_at for update skip locked limit $1) returning *`, [limit]);
  return rows.map(mapPayment);
}

export const updatePayment = (db: Db, id: string, f: { status: PaymentStatus; paypalBatchId?: string | null; paypalItemId?: string | null; lastError?: string | null; releaseInSeconds?: number }) =>
  db.query(
    `update payments set status=$2, paypal_batch_id=coalesce($3, paypal_batch_id), paypal_item_id=coalesce($4, paypal_item_id),
       last_error=$5, release_at = case when $6::int is null then release_at else now() + make_interval(secs => $6::int) end, updated_at=now() where id=$1`,
    [id, f.status, f.paypalBatchId ?? null, f.paypalItemId ?? null, f.lastError ?? null, f.releaseInSeconds ?? null]);

/** Payments stuck mid-flight (worker crashed). */
export async function staleSubmitting(db: Db): Promise<Payment[]> {
  return (await q<Row>(db, `select * from payments where status='SUBMITTING' and updated_at < now() - interval '2 minutes' for update skip locked`)).map(mapPayment);
}
export async function awaitingSettlement(db: Db): Promise<Payment[]> {
  return (await q<Row>(db, `select * from payments where status in ('SUBMITTED') and updated_at < now() - interval '20 seconds' order by updated_at limit 25`)).map(mapPayment);
}

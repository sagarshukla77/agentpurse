import type { Mandate, MandateStatus } from '@/core/types';
import { one, pool, q, type Db } from '../db';

export interface MandateRecord extends Mandate { createdBy: string | null; activatedBy: string | null; createdAt: Date }

const SELECT = `select m.*, coalesce((select array_agg(vendor_id::text) from mandate_vendors mv where mv.mandate_id = m.id), '{}') as vendor_ids from mandates m`;

interface Row {
  id: string; name: string; status: MandateStatus; currency: string; budget_cents: string; per_payment_cap_cents: string;
  approval_threshold_cents: string; velocity_max_per_hour: number; expires_at: Date; vendor_ids: string[];
  created_by: string | null; activated_by: string | null; created_at: Date;
}
const map = (r: Row): MandateRecord => ({
  id: r.id, name: r.name, status: r.status, currency: r.currency.trim(), budgetCents: Number(r.budget_cents),
  perPaymentCapCents: Number(r.per_payment_cap_cents), approvalThresholdCents: Number(r.approval_threshold_cents),
  velocityMaxPerHour: r.velocity_max_per_hour, expiresAt: r.expires_at, vendorIds: r.vendor_ids ?? [],
  createdBy: r.created_by, activatedBy: r.activated_by, createdAt: r.created_at,
});

/** `lock` takes a row lock, serialising every budget decision for this mandate. */
export async function getMandate(db: Db, id: string, opts: { lock?: boolean } = {}): Promise<MandateRecord | null> {
  if (opts.lock) await db.query('select 1 from mandates where id=$1 for update', [id]);
  const r = await one<Row>(db, `${SELECT} where m.id=$1`, [id]);
  return r ? map(r) : null;
}
export const listMandates = async (db: Db = pool()) => (await q<Row>(db, `${SELECT} order by m.created_at desc`)).map(map);

export interface NewMandate { name: string; currency: string; budgetCents: number; perPaymentCapCents: number; approvalThresholdCents: number; velocityMaxPerHour: number; expiresAt: Date; vendorIds: string[]; createdBy: string | null; status?: MandateStatus }

export async function insertMandate(db: Db, m: NewMandate): Promise<string> {
  const r = await one<{ id: string }>(db,
    `insert into mandates (name,status,currency,budget_cents,per_payment_cap_cents,approval_threshold_cents,velocity_max_per_hour,expires_at,created_by,activated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [m.name, m.status ?? 'pending_activation', m.currency, m.budgetCents, m.perPaymentCapCents, m.approvalThresholdCents, m.velocityMaxPerHour, m.expiresAt, m.createdBy, m.status === 'active' ? m.createdBy : null]);
  for (const v of m.vendorIds) await db.query('insert into mandate_vendors (mandate_id, vendor_id) values ($1,$2) on conflict do nothing', [r!.id, v]);
  return r!.id;
}

export async function setMandateStatus(db: Db, id: string, status: MandateStatus, activatedBy: string | null): Promise<void> {
  await db.query('update mandates set status=$2, activated_by=$3 where id=$1', [id, status, activatedBy]);
}

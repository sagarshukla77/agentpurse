import { one, pool, q, type Db } from '../db';

export interface Approval { id: string; invoiceId: string; status: 'pending' | 'approved' | 'rejected'; tokenNonce: string | null; tokenUsed: boolean; decidedBy: string | null; note: string | null }
interface Row { id: string; invoice_id: string; status: Approval['status']; token_nonce: string | null; token_used: boolean; decided_by: string | null; note: string | null }
const map = (r: Row): Approval => ({ id: r.id, invoiceId: r.invoice_id, status: r.status, tokenNonce: r.token_nonce, tokenUsed: r.token_used, decidedBy: r.decided_by, note: r.note });

export const insertApproval = async (db: Db, invoiceId: string) => map((await one<Row>(db, 'insert into approvals (invoice_id) values ($1) returning *', [invoiceId]))!);
export const getApproval = async (db: Db, id: string, lock = false) => { const r = await one<Row>(db, `select * from approvals where id=$1 ${lock ? 'for update' : ''}`, [id]); return r ? map(r) : null; };
export const setNonce = (db: Db, id: string, nonce: string) => db.query('update approvals set token_nonce=$2, token_used=false where id=$1', [id, nonce]);
export const decideApproval = (db: Db, id: string, status: 'approved' | 'rejected', by: string, note: string | null) =>
  db.query('update approvals set status=$2, decided_by=$3, decided_at=now(), note=$4, token_used=true where id=$1', [id, status, by, note]);

export async function listPending() {
  return q<Record<string, unknown>>(pool(),
    `select a.id as approval_id, a.created_at, i.id as invoice_id, i.vendor_name, i.invoice_number, i.amount_cents, i.currency, i.submitted_by_kind, d.reasons, d.explanation, v.name as vendor_registry_name
     from approvals a join invoices i on i.id=a.invoice_id join decisions d on d.invoice_id=i.id left join vendors v on v.id=i.vendor_id
     where a.status='pending' order by a.created_at asc`);
}

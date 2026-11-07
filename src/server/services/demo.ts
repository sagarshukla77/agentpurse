import { one, tx } from '../db';
import { env } from '../env';
import { conflict, forbidden } from '../errors';
import { audit } from '../repos/audit';

/**
 * Lets a judge (or you) re-run the Playground from a clean slate without touching the database.
 * Deliberately narrow:
 *  - only when DEMO_MODE=true, so it can never exist in a real deployment
 *  - owner only (enforced by RBAC at the route)
 *  - refuses while a payment is still in flight with PayPal
 *  - keeps vendors, mandates, users and the seeded payment history
 *  - NEVER touches the audit trail (it is append-only); the reset itself is recorded in it
 */
export async function resetDemoData(userId: string): Promise<{ invoices: number; payments: number }> {
  if (!env().demoMode) throw forbidden('Demo reset is only available when DEMO_MODE=true');
  return tx(async (db) => {
    const busy = await one<{ c: string }>(db, `select count(*) c from payments where status in ('SUBMITTING','UNKNOWN','SUBMITTED')`);
    if (Number(busy!.c) > 0) throw conflict('A payment is still in flight with PayPal. Wait for it to settle, then reset');

    const target = `select id from invoices where coalesce(invoice_number,'') not like 'HIST-%'`;
    const p = await db.query(`delete from payments where invoice_id in (${target})`);
    const i = await db.query(`delete from invoices where id in (${target})`); // decisions + approvals cascade
    await db.query('delete from webhook_events');
    const out = { invoices: i.rowCount ?? 0, payments: p.rowCount ?? 0 };
    await audit(db, { actorKind: 'user', actorId: userId, action: 'DEMO_RESET', subjectType: 'system', detail: out });
    return out;
  });
}

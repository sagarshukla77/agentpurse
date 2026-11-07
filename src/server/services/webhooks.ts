import { fromPayPalItemStatus } from '@/core/state-machine';
import { getItem } from '@/paypal/payouts';
import { verifyWebhook } from '@/paypal/webhook-verify';
import { pool, tx } from '../db';
import { auditStandalone } from '../repos/audit';
import { getPaymentByItem } from '../repos/payments';
import { applyPaymentStatus } from './payments';

/**
 * Webhook = a doorbell, not a source of truth. We (1) verify the signature, (2) drop replays by
 * event id, and (3) re-read the payout item from PayPal and apply THAT, monotonically.
 */
export async function handleWebhook(rawBody: string, headers: Headers): Promise<{ status: number; outcome: string }> {
  if (!(await verifyWebhook(headers, rawBody))) {
    await auditStandalone({ actorKind: 'paypal', action: 'WEBHOOK_REJECTED', detail: { reason: 'signature verification failed' } });
    return { status: 401, outcome: 'invalid signature' };
  }
  let event: { id?: string; event_type?: string; resource?: Record<string, any> };
  try { event = JSON.parse(rawBody); } catch { return { status: 400, outcome: 'bad json' }; }
  if (!event.id || !event.event_type) return { status: 400, outcome: 'missing id or type' };

  const inserted = await pool().query(
    'insert into webhook_events (event_id, event_type, payload) values ($1,$2,$3) on conflict (event_id) do nothing returning event_id',
    [event.id, event.event_type, JSON.stringify(event)]);
  if (inserted.rowCount === 0) return { status: 200, outcome: 'replay ignored' };

  let outcome = 'ignored';
  if (event.event_type.startsWith('PAYMENT.PAYOUTS-ITEM.')) {
    const itemId = String(event.resource?.payout_item_id ?? '');
    const senderItemId = (event.resource?.payout_item?.sender_item_id as string | undefined) ?? null;
    const payment = itemId ? await getPaymentByItem(pool(), itemId, senderItemId) : null;
    if (!payment) outcome = 'no matching payment';
    else {
      const item = await getItem(itemId); // authoritative
      const next = fromPayPalItemStatus(item.status);
      const moved = await tx(async (db) => {
        await db.query('update payments set paypal_item_id=$2 where id=$1 and paypal_item_id is null', [payment.id, itemId]);
        return next ? applyPaymentStatus(db, payment.id, next, { source: 'paypal', itemId, error: item.errorMessage }) : false;
      });
      outcome = moved ? `payment → ${next}` : 'no change';
    }
  }
  await pool().query('update webhook_events set outcome=$2 where event_id=$1', [event.id, outcome]);
  return { status: 200, outcome };
}

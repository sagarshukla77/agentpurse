import { centsToDecimal } from '@/core/money';
import { env } from '@/server/env';
import { PayPalUnknownOutcome, paypalRequest } from './client';

export interface PayoutRequest {
  senderBatchId: string; requestId: string; receiver: string; amountCents: number; currency: string; senderItemId: string; note: string;
}

export type PayoutOutcome =
  | { kind: 'accepted'; batchId: string }
  | { kind: 'duplicate'; batchId: string | null }  // PayPal already has this sender_batch_id: money is already moving
  | { kind: 'rejected'; message: string }           // definitively not sent
  | { kind: 'unknown'; message: string };           // we cannot tell: retry with the same ids

export async function submitPayout(r: PayoutRequest): Promise<PayoutOutcome> {
  if (!env().paypal.live) return { kind: 'accepted', batchId: `SIM-${r.senderBatchId}` };
  try {
    const res = await paypalRequest('/v1/payments/payouts', {
      method: 'POST',
      requestId: r.requestId,
      body: {
        sender_batch_header: { sender_batch_id: r.senderBatchId, email_subject: 'You have a payment', email_message: 'A payment was sent to you.' },
        items: [{
          recipient_type: 'EMAIL', receiver: r.receiver, sender_item_id: r.senderItemId, note: r.note.slice(0, 200),
          amount: { value: centsToDecimal(r.amountCents), currency: r.currency }, recipient_wallet: 'PAYPAL',
        }],
      },
    });
    if (res.status === 201 || res.status === 200) {
      return { kind: 'accepted', batchId: String(res.body?.batch_header?.payout_batch_id ?? '') };
    }
    const message = String(res.body?.message ?? res.body?.name ?? `HTTP ${res.status}`);
    // A reused sender_batch_id is rejected with a HATEOAS link to the original batch.
    const link = (res.body?.links as { href?: string }[] | undefined)?.find((l) => l.href?.includes('/payouts/'))?.href;
    if (link || /duplicate/i.test(message)) return { kind: 'duplicate', batchId: link ? link.split('/').pop() ?? null : null };
    if (res.status >= 500 || res.status === 429) return { kind: 'unknown', message };
    return { kind: 'rejected', message };
  } catch (e) {
    if (e instanceof PayPalUnknownOutcome) return { kind: 'unknown', message: e.message };
    throw e;
  }
}

export interface PayoutItemInfo { payoutItemId: string; senderItemId: string | null; status: string; errorMessage: string | null }

export async function getBatchItems(batchId: string): Promise<PayoutItemInfo[]> {
  if (!env().paypal.live) return [{ payoutItemId: `SIM-ITEM-${batchId}`, senderItemId: null, status: 'SUCCESS', errorMessage: null }];
  const res = await paypalRequest(`/v1/payments/payouts/${encodeURIComponent(batchId)}`);
  if (res.status !== 200) throw new Error(`Could not read payout batch (${res.status})`);
  return ((res.body?.items ?? []) as any[]).map(toItem);
}

export async function getItem(itemId: string): Promise<PayoutItemInfo> {
  if (!env().paypal.live) return { payoutItemId: itemId, senderItemId: null, status: 'SUCCESS', errorMessage: null };
  const res = await paypalRequest(`/v1/payments/payouts-item/${encodeURIComponent(itemId)}`);
  if (res.status !== 200) throw new Error(`Could not read payout item (${res.status})`);
  return toItem(res.body);
}

const toItem = (i: any): PayoutItemInfo => ({
  payoutItemId: String(i.payout_item_id),
  senderItemId: i.payout_item?.sender_item_id ?? null,
  status: String(i.transaction_status ?? 'PENDING'),
  errorMessage: i.errors?.message ?? null,
});

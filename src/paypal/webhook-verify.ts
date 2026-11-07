import { env } from '@/server/env';
import { paypalRequest } from './client';

/**
 * Verifies a webhook with PayPal's own verify-webhook-signature endpoint. Anything that fails
 * verification is rejected before it touches our data. (Even verified events are only treated as a
 * trigger: the service re-reads the payout item from PayPal and trusts that.)
 */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const { live, webhookId } = env().paypal;
  if (!live) return true; // simulated mode has no real PayPal to verify against
  if (!webhookId) return false;
  const h = (n: string) => headers.get(n) ?? '';
  let event: unknown;
  try { event = JSON.parse(rawBody); } catch { return false; }
  const res = await paypalRequest('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: {
      auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'),
      webhook_id: webhookId, webhook_event: event,
    },
  });
  return res.status === 200 && res.body?.verification_status === 'SUCCESS';
}

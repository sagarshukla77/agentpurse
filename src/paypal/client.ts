import { env } from '@/server/env';

/** Thrown when we cannot tell whether PayPal received the request (timeout, network drop, 5xx). */
export class PayPalUnknownOutcome extends Error {}

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  const { baseUrl, clientId, clientSecret } = env().paypal;
  if (!clientId || !clientSecret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not set');
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return token.value;
}

export interface PayPalResponse { status: number; body: any }

export async function paypalRequest(path: string, opts: { method?: string; body?: unknown; requestId?: string } = {}): Promise<PayPalResponse> {
  const bearer = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${env().paypal.baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        ...(opts.requestId ? { 'PayPal-Request-Id': opts.requestId } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new PayPalUnknownOutcome(e instanceof Error ? e.message : 'network error');
  }
  if (res.status === 401) token = null; // force a refresh next time
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  return { status: res.status, body };
}

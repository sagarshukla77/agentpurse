import { hmac, safeEqual } from './crypto';

/**
 * An approval is only valid for the exact thing the human was shown. The token binds the
 * approval to invoice, vendor, amount, currency, the decision that was made, and the approver.
 * If any of those change after the page was rendered, verification fails.
 */
export interface ApprovalBinding {
  approvalId: string;
  invoiceId: string;
  vendorId: string | null;
  amountCents: number;
  currency: string;
  decisionHash: string;
  userId: string;
}

type Payload = ApprovalBinding & { nonce: string; exp: number };
export type TokenCheck = { ok: true; nonce: string } | { ok: false; reason: string };

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function signApprovalToken(secret: string, b: ApprovalBinding, nonce: string, ttlSec = 600, nowMs = Date.now()): string {
  const body = b64(JSON.stringify({ ...b, nonce, exp: Math.floor(nowMs / 1000) + ttlSec } satisfies Payload));
  return `${body}.${hmac(secret, body)}`;
}

export function verifyApprovalToken(secret: string, token: string, expected: ApprovalBinding, nowMs = Date.now()): TokenCheck {
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, hmac(secret, body))) return { ok: false, reason: 'Invalid approval token' };
  let p: Payload;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'Malformed approval token' }; }
  if (p.exp * 1000 < nowMs) return { ok: false, reason: 'Approval token expired. Reload the approval' };
  const keys = Object.keys(expected) as (keyof ApprovalBinding)[];
  if (keys.some((k) => p[k] !== expected[k])) return { ok: false, reason: 'The invoice changed since you opened it. Review it again' };
  return { ok: true, nonce: p.nonce };
}

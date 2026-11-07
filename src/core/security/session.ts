import { hmac, safeEqual } from './crypto';

export interface SessionClaims { uid: string; exp: number } // exp: unix seconds

export function signSession(secret: string, claims: SessionClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${hmac(secret, body)}`;
}

export function verifySession(secret: string, token: string | undefined, nowMs = Date.now()): SessionClaims | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, hmac(secret, body))) return null;
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionClaims;
    return typeof c.uid === 'string' && c.exp * 1000 > nowMs ? c : null;
  } catch { return null; }
}

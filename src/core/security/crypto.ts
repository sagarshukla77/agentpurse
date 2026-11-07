import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');
export const hmac = (key: string, data: string): string => createHmac('sha256', key).update(data).digest('base64url');
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). Key: 32 bytes, base64. */
export function encrypt(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64)');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(payload: string, keyB64: string): string {
  const [v, iv, tag, ct] = payload.split('.');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unsupported ciphertext');
  const d = createDecipheriv('aes-256-gcm', Buffer.from(keyB64, 'base64'), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

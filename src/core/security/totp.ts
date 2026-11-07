import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = (): string => base32Encode(randomBytes(20));

/** RFC 6238 (SHA-1, 6 digits, 30 s). */
export function totpAt(secret: string, atMs: number, stepSec = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / stepSec)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/** Accepts the current code and one step either side to tolerate clock drift. */
export function verifyTotp(secret: string, code: string, nowMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((w) => totpAt(secret, nowMs + w * 30_000) === code);
}

export const otpauthUri = (secret: string, account: string, issuer = 'AgentPurse'): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

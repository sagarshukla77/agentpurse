import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, sha256 } from '../src/core/security/crypto';
import { hashPassword, verifyPassword } from '../src/core/security/password';
import { base32Encode, newTotpSecret, totpAt, verifyTotp } from '../src/core/security/totp';
import { signApprovalToken, verifyApprovalToken, type ApprovalBinding } from '../src/core/security/tokens';
import { signSession, verifySession } from '../src/core/security/session';
import { RateLimiter } from '../src/core/security/rate-limit';
import { can } from '../src/core/security/rbac';

test('AES-GCM round-trips and detects tampering', () => {
  const key = randomBytes(32).toString('base64');
  const ct = encrypt('payee@example.com', key);
  assert.equal(decrypt(ct, key), 'payee@example.com');
  assert.notEqual(encrypt('payee@example.com', key), ct, 'random IV');
  const parts = ct.split('.');
  parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decrypt(parts.join('.'), key));
  assert.throws(() => encrypt('x', 'short'));
  assert.equal(sha256('a').length, 64);
});

test('scrypt password hashing', async () => {
  const h = await hashPassword('correct horse');
  assert.ok(await verifyPassword('correct horse', h));
  assert.equal(await verifyPassword('wrong', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('TOTP matches the RFC 6238 test vector and tolerates one step of drift', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totpAt(secret, 59_000), '287082'); // RFC 6238 appendix B, last 6 digits of 94287082
  assert.ok(verifyTotp(secret, '287082', 59_000));
  assert.ok(verifyTotp(secret, '287082', 59_000 + 30_000));
  assert.equal(verifyTotp(secret, '287082', 59_000 + 120_000), false);
  assert.equal(verifyTotp(secret, 'abcdef'), false);
  assert.equal(newTotpSecret().length, 32);
});

const binding: ApprovalBinding = { approvalId: 'a1', invoiceId: 'i1', vendorId: 'v1', amountCents: 45_000, currency: 'USD', decisionHash: 'd1', userId: 'u1' };
test('approval token verifies only for the exact binding', () => {
  const t = signApprovalToken('secret', binding, 'n1', 600, 1_000_000);
  assert.deepEqual(verifyApprovalToken('secret', t, binding, 1_000_000 + 1000), { ok: true, nonce: 'n1' });
  for (const change of [{ amountCents: 45_001 }, { vendorId: 'v2' }, { invoiceId: 'i2' }, { decisionHash: 'd2' }, { userId: 'u2' }, { currency: 'EUR' }]) {
    const r = verifyApprovalToken('secret', t, { ...binding, ...change }, 1_000_000 + 1000);
    assert.equal(r.ok, false, JSON.stringify(change));
  }
});
test('approval token rejects expiry, forgery and wrong key', () => {
  const t = signApprovalToken('secret', binding, 'n1', 600, 1_000_000);
  assert.equal(verifyApprovalToken('secret', t, binding, 1_000_000 + 601_000).ok, false);
  assert.equal(verifyApprovalToken('other', t, binding, 1_000_000).ok, false);
  const [body] = t.split('.');
  assert.equal(verifyApprovalToken('secret', `${body}.forged`, binding, 1_000_000).ok, false);
  assert.equal(verifyApprovalToken('secret', 'garbage', binding).ok, false);
});

test('sessions expire and cannot be forged', () => {
  const now = 1_000_000;
  const t = signSession('s', { uid: 'u1', exp: Math.floor(now / 1000) + 60 });
  assert.equal(verifySession('s', t, now)?.uid, 'u1');
  assert.equal(verifySession('s', t, now + 61_000), null);
  assert.equal(verifySession('x', t, now), null);
  assert.equal(verifySession('s', undefined, now), null);
});

test('rate limiter blocks the N+1th hit and recovers', () => {
  const rl = new RateLimiter();
  for (let i = 0; i < 3; i++) assert.ok(rl.hit('k', 3, 1000, 0).ok);
  assert.equal(rl.hit('k', 3, 1000, 10).ok, false);
  assert.ok(rl.hit('k', 3, 1000, 1500).ok);
  assert.ok(rl.hit('other', 3, 1000, 10).ok);
});

test('RBAC enforces least privilege', () => {
  assert.equal(can('viewer', 'approval:decide'), false);
  assert.equal(can('viewer', 'invoice:read'), true);
  assert.equal(can('approver', 'approval:decide'), true);
  assert.equal(can('approver', 'mandate:create'), false);
  assert.equal(can('approver', 'killswitch:release'), false);
  assert.equal(can('owner', 'killswitch:release'), true);
  assert.equal(can('owner', 'demo:reset'), true);
  assert.equal(can('approver', 'demo:reset'), false);
  assert.equal(can('viewer', 'demo:reset'), false);
});

import { validateUpload } from '../src/core/upload';
test('uploads are validated by magic bytes and size', () => {
  const pdf = Buffer.from('%PDF-1.7 hello').toString('base64');
  assert.deepEqual(validateUpload(pdf), { ok: true, kind: 'pdf', mime: 'application/pdf', bytes: 14 });
  assert.equal(validateUpload(Buffer.from('<script>alert(1)</script>').toString('base64')).ok, false);
  assert.equal(validateUpload(Buffer.from('MZ\x90\x00 exe').toString('base64')).ok, false);
  assert.equal(validateUpload('not base64!!').ok, false);
  assert.equal(validateUpload(Buffer.alloc(3 * 1024 * 1024, 0x25).toString('base64')).ok, false);
});

test('encryption round-trips an empty string (and refuses an invalid payload)', () => {
  const key = randomBytes(32).toString('base64');
  assert.equal(decrypt(encrypt('', key), key), '');
  assert.throws(() => decrypt('garbage', key), /Unsupported ciphertext/);
});

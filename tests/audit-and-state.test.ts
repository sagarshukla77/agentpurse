import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENESIS_HASH, hashRecord, verifyChain, type AuditBody, type AuditRecord } from '../src/core/audit/chain';
import { assertInvoiceTransition, canMovePayment, fromPayPalItemStatus, IllegalTransition, paymentToInvoiceStatus } from '../src/core/state-machine';

function build(n: number): AuditRecord[] {
  const out: AuditRecord[] = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < n; i++) {
    const body: AuditBody = { id: `id${i}`, ts: new Date(1_700_000_000_000 + i * 1000).toISOString(), actorKind: 'system', actorId: null, action: 'X', subjectType: 'invoice', subjectId: 'i1', detail: { n: i, z: 1, a: 2 } };
    const hash = hashRecord(prev, body);
    out.push({ ...body, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

test('audit chain verifies when intact', () => assert.deepEqual(verifyChain(build(20)), { ok: true, checked: 20 }));
test('audit chain detects an edited row', () => {
  const c = build(10);
  c[4] = { ...c[4], detail: { ...c[4].detail, n: 999 } };
  const r = verifyChain(c);
  assert.equal(r.ok, false);
  assert.equal(r.brokenAtIndex, 4);
});
test('audit chain detects deletion and reordering', () => {
  const c = build(10);
  assert.equal(verifyChain([...c.slice(0, 3), ...c.slice(4)]).ok, false);
  assert.equal(verifyChain([c[1], c[0], ...c.slice(2)]).ok, false);
});
test('audit hash is independent of key order', () => {
  const a: AuditBody = { id: '1', ts: 't', actorKind: 'user', actorId: null, action: 'A', subjectType: null, subjectId: null, detail: { a: 1, b: { c: 2, d: 3 } } };
  const b: AuditBody = { ...a, detail: { b: { d: 3, c: 2 }, a: 1 } };
  assert.equal(hashRecord(GENESIS_HASH, a), hashRecord(GENESIS_HASH, b));
});

test('invoice state machine allows the happy paths only', () => {
  assertInvoiceTransition('AWAITING_APPROVAL', 'PAYMENT_PENDING');
  assertInvoiceTransition('PAYMENT_PENDING', 'PAID');
  assert.throws(() => assertInvoiceTransition('PAID', 'PAYMENT_PENDING'), IllegalTransition);
  assert.throws(() => assertInvoiceTransition('REJECTED', 'PAYMENT_PENDING'), IllegalTransition);
});

test('payment states are monotonic: late webhooks cannot move a payment backwards', () => {
  assert.ok(canMovePayment('SUBMITTED', 'PAID'));
  assert.ok(canMovePayment('UNKNOWN', 'PAID'));
  assert.equal(canMovePayment('PAID', 'SUBMITTED'), false);
  assert.equal(canMovePayment('FAILED', 'PAID'), false);
  assert.equal(canMovePayment('CANCELED', 'SUBMITTING'), false);
  assert.ok(canMovePayment('PAID', 'PAID'), 'replaying the same state is a no-op');
});

test('PayPal status mapping', () => {
  assert.equal(fromPayPalItemStatus('SUCCESS'), 'PAID');
  assert.equal(fromPayPalItemStatus('unclaimed'), 'SUBMITTED');
  assert.equal(fromPayPalItemStatus('RETURNED'), 'RETURNED');
  assert.equal(fromPayPalItemStatus('BLOCKED'), 'BLOCKED');
  assert.equal(fromPayPalItemStatus('???'), null);
  assert.equal(paymentToInvoiceStatus('PAID'), 'PAID');
  assert.equal(paymentToInvoiceStatus('RETURNED'), 'PAYMENT_FAILED');
  assert.equal(paymentToInvoiceStatus('SUBMITTED'), null);
});

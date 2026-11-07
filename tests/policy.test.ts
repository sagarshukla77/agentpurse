import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/core/policy/evaluate';
import type { Mandate, PolicyContext, Proposal } from '../src/core/types';

const NOW = new Date('2026-11-05T12:00:00Z');
const mandate: Mandate = {
  id: 'm1', name: 'Ops', status: 'active', currency: 'USD', budgetCents: 100_000, perPaymentCapCents: 30_000,
  approvalThresholdCents: 20_000, velocityMaxPerHour: 3, expiresAt: new Date('2026-12-01T00:00:00Z'), vendorIds: ['v1'],
};
const proposal = (o: Partial<Proposal> = {}): Proposal => ({ amountCents: 10_000, currency: 'USD', vendorId: 'v1', riskFlags: [], ...o });
const ctx = (o: Partial<PolicyContext> = {}): PolicyContext => ({
  now: NOW, killSwitch: false, vendor: { status: 'verified', allowlisted: true, priorPaidCount: 2 },
  spentThisPeriodCents: 0, paymentsLastHour: 0, approved: false, ...o,
});
const codes = (d: ReturnType<typeof evaluate>) => d.reasons.map((r) => r.code);

test('ALLOW when every rule passes', () => {
  const d = evaluate(proposal(), mandate, ctx());
  assert.equal(d.verdict, 'ALLOW');
  assert.equal(d.reasons.length, 0);
  assert.ok(d.trace.length >= 15, 'every rule appears in the trace');
});

test('DENY: kill switch', () => assert.deepEqual(codes(evaluate(proposal(), mandate, ctx({ killSwitch: true }))), ['KILL_SWITCH']));
test('DENY: inactive mandate', () => assert.ok(codes(evaluate(proposal(), { ...mandate, status: 'pending_activation' }, ctx())).includes('MANDATE_INACTIVE')));
test('DENY: expired mandate', () => assert.ok(codes(evaluate(proposal(), { ...mandate, expiresAt: new Date('2026-11-01') }, ctx())).includes('MANDATE_EXPIRED')));
test('DENY: currency mismatch', () => assert.ok(codes(evaluate(proposal({ currency: 'EUR' }), mandate, ctx())).includes('CURRENCY_MISMATCH')));
test('DENY: zero or negative amount', () => {
  assert.ok(codes(evaluate(proposal({ amountCents: 0 }), mandate, ctx())).includes('AMOUNT_INVALID'));
  assert.ok(codes(evaluate(proposal({ amountCents: -5 }), mandate, ctx())).includes('AMOUNT_INVALID'));
});
test('DENY: unknown vendor', () => {
  const d = evaluate(proposal({ vendorId: null }), mandate, ctx({ vendor: { status: 'unknown', allowlisted: false, priorPaidCount: 0 } }));
  assert.equal(d.verdict, 'DENY');
  assert.ok(codes(d).includes('VENDOR_UNKNOWN'));
});
test('DENY: unverified and blocked vendors', () => {
  for (const status of ['pending', 'blocked'] as const) {
    const d = evaluate(proposal(), mandate, ctx({ vendor: { status, allowlisted: true, priorPaidCount: 5 } }));
    assert.ok(codes(d).includes('VENDOR_UNVERIFIED'), status);
  }
});
test('DENY: vendor not on allowlist', () => assert.ok(codes(evaluate(proposal(), mandate, ctx({ vendor: { status: 'verified', allowlisted: false, priorPaidCount: 1 } }))).includes('VENDOR_NOT_ALLOWLISTED')));
test('DENY: injection and duplicate flags', () => {
  assert.ok(codes(evaluate(proposal({ riskFlags: ['PROMPT_INJECTION'] }), mandate, ctx())).includes('PROMPT_INJECTION'));
  assert.ok(codes(evaluate(proposal({ riskFlags: ['DUPLICATE'] }), mandate, ctx())).includes('DUPLICATE'));
});
test('DENY: per-payment cap is inclusive at the boundary', () => {
  assert.equal(evaluate(proposal({ amountCents: 30_000 }), mandate, ctx({ approved: true })).verdict, 'ALLOW');
  assert.ok(codes(evaluate(proposal({ amountCents: 30_001 }), mandate, ctx())).includes('OVER_PER_PAYMENT_CAP'));
});
test('DENY: budget exhausted counts reserved spend', () => {
  assert.equal(evaluate(proposal({ amountCents: 10_000 }), mandate, ctx({ spentThisPeriodCents: 90_000 })).verdict, 'ALLOW');
  assert.ok(codes(evaluate(proposal({ amountCents: 10_001 }), mandate, ctx({ spentThisPeriodCents: 90_000 }))).includes('BUDGET_EXHAUSTED'));
});

test('ESCALATE: first payment, threshold, velocity, anomaly, payee, math, confidence', () => {
  const cases: [Partial<Proposal>, Partial<PolicyContext>, string][] = [
    [{}, { vendor: { status: 'verified', allowlisted: true, priorPaidCount: 0 } }, 'FIRST_PAYMENT'],
    [{ amountCents: 25_000 }, {}, 'OVER_APPROVAL_THRESHOLD'],
    [{}, { paymentsLastHour: 3 }, 'VELOCITY'],
    [{ riskFlags: ['ANOMALOUS_AMOUNT'] }, {}, 'ANOMALOUS_AMOUNT'],
    [{ riskFlags: ['PAYEE_MISMATCH'] }, {}, 'PAYEE_MISMATCH'],
    [{ riskFlags: ['MATH_MISMATCH'] }, {}, 'MATH_MISMATCH'],
    [{ riskFlags: ['LOW_CONFIDENCE'] }, {}, 'LOW_CONFIDENCE'],
  ];
  for (const [p, c, code] of cases) {
    const d = evaluate(proposal(p), mandate, ctx(c));
    assert.equal(d.verdict, 'ESCALATE', code);
    assert.deepEqual(codes(d), [code]);
  }
});

test('DENY beats ESCALATE', () => {
  const d = evaluate(proposal({ amountCents: 40_000 }), mandate, ctx());
  assert.equal(d.verdict, 'DENY'); // over cap, also over threshold
  assert.ok(codes(d).includes('OVER_APPROVAL_THRESHOLD'));
});

test('human approval lifts escalations but never denials', () => {
  assert.equal(evaluate(proposal({ amountCents: 25_000, riskFlags: ['PAYEE_MISMATCH'] }), mandate, ctx({ approved: true })).verdict, 'ALLOW');
  for (const flag of ['PROMPT_INJECTION', 'DUPLICATE'] as const)
    assert.equal(evaluate(proposal({ riskFlags: [flag] }), mandate, ctx({ approved: true })).verdict, 'DENY');
  assert.equal(evaluate(proposal(), mandate, ctx({ approved: true, killSwitch: true })).verdict, 'DENY');
  assert.equal(evaluate(proposal(), mandate, ctx({ approved: true, spentThisPeriodCents: 100_000 })).verdict, 'DENY');
});

test('evaluate is deterministic', () => {
  const a = evaluate(proposal({ riskFlags: ['MATH_MISMATCH'] }), mandate, ctx());
  const b = evaluate(proposal({ riskFlags: ['MATH_MISMATCH'] }), mandate, ctx());
  assert.deepEqual(a, b);
});

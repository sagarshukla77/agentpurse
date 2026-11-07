import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, type StoredDecision } from '../src/core/replay';
import type { Mandate } from '../src/core/types';

const base: Mandate = { id: 'm', name: 'x', status: 'active', currency: 'USD', budgetCents: 100_000, perPaymentCapCents: 50_000, approvalThresholdCents: 40_000, velocityMaxPerHour: 10, expiresAt: new Date('2030-01-01'), vendorIds: [] };
const facts = { status: 'verified', allowlisted: true, priorPaidCount: 3 } as const;
const mk = (i: number, cents: number, verdict: StoredDecision['verdict']): StoredDecision => ({
  id: `d${i}`, createdAt: new Date(1_700_000_000_000 + i * 60_000), verdict, vendorFacts: facts,
  proposal: { amountCents: cents, currency: 'USD', vendorId: 'v', riskFlags: [] },
});

test('replay shows what a stricter mandate would have changed', () => {
  const history = [mk(1, 30_000, 'ALLOW'), mk(2, 45_000, 'ALLOW'), mk(3, 20_000, 'ALLOW')];
  const same = replay(history, base);
  assert.equal(same.changed, 1); // 45k is over the 40k threshold under the candidate
  const stricter = replay(history, { ...base, perPaymentCapCents: 25_000, budgetCents: 40_000 });
  assert.ok(stricter.counts.DENY >= 2);
  assert.equal(stricter.rows.length, 3);
});
test('replay rebuilds running spend', () => {
  const history = [mk(1, 40_000, 'ALLOW'), mk(2, 40_000, 'ALLOW'), mk(3, 40_000, 'ALLOW')];
  const r = replay(history, { ...base, approvalThresholdCents: 50_000 });
  assert.deepEqual(r.rows.map((x) => x.after), ['ALLOW', 'ALLOW', 'DENY']); // third exceeds the 100k budget
});

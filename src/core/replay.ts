import type { Mandate, Proposal, Verdict, VendorFacts } from './types';
import { evaluate } from './policy/evaluate';

export interface StoredDecision {
  id: string;
  createdAt: Date;
  proposal: Proposal;
  vendorFacts: VendorFacts;
  verdict: Verdict;
}

export interface ReplayRow { id: string; before: Verdict; after: Verdict; changed: boolean }
export interface ReplayResult { rows: ReplayRow[]; counts: Record<Verdict, number>; changed: number }

/**
 * "What if this mandate had been in force?" Re-runs stored proposals, oldest first,
 * against a candidate mandate. Spend and payment velocity are rebuilt from the replay
 * itself. This is an approximation (it cannot know about human approvals).
 */
export function replay(decisions: StoredDecision[], candidate: Mandate): ReplayResult {
  const sorted = [...decisions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const allowed: { at: number; cents: number }[] = [];
  const rows: ReplayRow[] = [];
  const counts: Record<Verdict, number> = { ALLOW: 0, ESCALATE: 0, DENY: 0 };

  for (const d of sorted) {
    const at = d.createdAt.getTime();
    const d2 = evaluate(d.proposal, { ...candidate, status: 'active', expiresAt: new Date(at + 86_400_000) }, {
      now: d.createdAt, killSwitch: false, vendor: d.vendorFacts, approved: false,
      spentThisPeriodCents: allowed.reduce((s, a) => s + a.cents, 0),
      paymentsLastHour: allowed.filter((a) => at - a.at < 3_600_000).length,
    });
    if (d2.verdict === 'ALLOW') allowed.push({ at, cents: d.proposal.amountCents });
    counts[d2.verdict]++;
    rows.push({ id: d.id, before: d.verdict, after: d2.verdict, changed: d.verdict !== d2.verdict });
  }
  return { rows, counts, changed: rows.filter((r) => r.changed).length };
}

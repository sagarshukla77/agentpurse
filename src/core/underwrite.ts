import type { Decision, ExtractedInvoice, Mandate, PolicyContext, Proposal, VendorFacts } from './types';
import { evaluate } from './policy/evaluate';
import { assessRisk, type HistoryInvoice } from './risk/checks';
import type { InjectionResult } from './risk/injection';

export interface UnderwriteInput {
  extracted: ExtractedInvoice;
  contentHash: string;
  vendor: { id: string; payeeEmail: string } | null;
  vendorFacts: VendorFacts;
  injection: InjectionResult;
  history: HistoryInvoice[];
  paidHistoryCents: number[];
  mandate: Mandate;
  killSwitch: boolean;
  spentThisPeriodCents: number;
  paymentsLastHour: number;
  now: Date;
}

/** Pure composition: structured extraction + world state → proposal → decision. */
export function underwrite(i: UnderwriteInput): { proposal: Proposal; decision: Decision } {
  const riskFlags = assessRisk({
    extracted: i.extracted, contentHash: i.contentHash, vendorId: i.vendor?.id ?? null,
    registryEmail: i.vendor?.payeeEmail ?? null, injection: i.injection, history: i.history,
    paidHistoryCents: i.paidHistoryCents, now: i.now,
  });
  const proposal: Proposal = { amountCents: i.extracted.amountCents, currency: i.extracted.currency, vendorId: i.vendor?.id ?? null, riskFlags };
  const ctx: PolicyContext = {
    now: i.now, killSwitch: i.killSwitch, vendor: i.vendorFacts,
    spentThisPeriodCents: i.spentThisPeriodCents, paymentsLastHour: i.paymentsLastHour, approved: false,
  };
  return { proposal, decision: evaluate(proposal, i.mandate, ctx) };
}

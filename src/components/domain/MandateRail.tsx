import { money } from '@/lib/format';
import type { MandateSummary } from '@/lib/dto';

/**
 * The product's signature visual: one bar that answers "how much authority has the AI used?"
 * Solid = paid, hatched = committed but not settled, empty = still available.
 */
export function MandateRail({ m, large }: { m: MandateSummary; large?: boolean }) {
  const used = m.paidCents + m.inFlightCents;
  const remaining = Math.max(0, m.budgetCents - used);
  const pct = (n: number) => `${Math.min(100, (n / m.budgetCents) * 100)}%`;
  return (
    <div className="rail-wrap">
      <div className="rail-top">
        <div>
          <div className="muted">Remaining authority</div>
          <div className={`num ${large ? 'rail-big' : ''}`} style={large ? undefined : { fontSize: 22, fontWeight: 680 }}>{money(remaining, m.currency)}</div>
        </div>
        <div className="muted num">of {money(m.budgetCents, m.currency)} budget</div>
      </div>
      <div className="rail" role="img" aria-label={`${money(m.paidCents, m.currency)} paid, ${money(m.inFlightCents, m.currency)} in flight, ${money(remaining, m.currency)} remaining`}>
        <div className="seg-paid" style={{ width: pct(m.paidCents) }} />
        <div className="seg-fly" style={{ width: pct(m.inFlightCents) }} />
      </div>
      <div className="rail-legend num">
        <span><i style={{ background: 'linear-gradient(90deg,#4f5df7,#c3f550)' }} />Paid {money(m.paidCents, m.currency)}</span>
        <span><i style={{ background: '#6a76ff' }} />In flight {money(m.inFlightCents, m.currency)}</span>
        <span><i style={{ background: '#2a3050' }} />Available {money(remaining, m.currency)}</span>
      </div>
      {large && (
        <div className="rail-gates">
          <div className="gate"><b className="num">{money(m.approvalThresholdCents, m.currency)}</b><span>auto-approve up to</span></div>
          <div className="gate"><b className="num">{money(m.perPaymentCapCents, m.currency)}</b><span>hard cap per payment</span></div>
          <div className="gate"><b>{new Date(m.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</b><span>mandate expires</span></div>
        </div>
      )}
    </div>
  );
}

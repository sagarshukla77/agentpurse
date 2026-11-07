import type { AuditEvent } from '@/lib/dto';
import { actionText, actionTone, dateTime } from '@/lib/format';

/** The audit trail for one invoice, told as a story. */
export function Timeline({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="muted">No events yet.</p>;
  const ACTOR: Record<string, string> = { ai: 'AI', system: 'System', paypal: 'PayPal', user: 'A person', agent: 'An agent' };
  return (
    <div className="timeline">
      {events.map((e) => {
        const t = actionTone(e.action);
        const extra = describe(e);
        return (
          <div key={e.id} className={`tl ${t === 'bad' || t === 'good' || t === 'warn' ? t : ''}`}>
            <i />
            <div>
              <b>{actionText(e.action)}</b>
              {extra && <small>{extra}</small>}
              <small>{ACTOR[e.actorKind] ?? e.actorKind} · {dateTime(e.ts)}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function describe(e: AuditEvent): string {
  const d = e.detail as Record<string, any>;
  switch (e.action) {
    case 'INVOICE_EXTRACTED': return `Confidence ${Math.round((d.confidence ?? 0) * 100)}% · vendor ${d.vendorMatched ? 'found in registry' : 'not in registry'}`;
    case 'RISK_ASSESSED': return (d.flags as string[])?.length ? `Flags: ${(d.flags as string[]).join(', ').toLowerCase().replace(/_/g, ' ')}` : 'No risk flags';
    case 'POLICY_DECIDED': return `${d.verdict}${(d.reasons as string[])?.length ? ': ' + (d.reasons as string[]).join(', ').toLowerCase().replace(/_/g, ' ') : ''}`;
    case 'PAYMENT_QUEUED': return d.releaseAt ? `Releases at ${dateTime(d.releaseAt)}` : '';
    case 'PAYMENT_FAILED': case 'PAYMENT_BLOCKED': return d.error ? String(d.error) : '';
    default: return '';
  }
}

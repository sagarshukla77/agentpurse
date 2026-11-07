import Link from 'next/link';
import type { DashboardData, InvoiceRow } from '@/lib/dto';
import { compactMoney, dateTime, money } from '@/lib/format';
import { Avatar } from '../ui/Avatar';
import { Money } from '../ui/Money';
import { Chip } from '../ui';
import { ActivityChart, type ChartSeries } from './ActivityChart';

/** Presentational dashboard: props in, markup out. The page component owns fetching. */
export function DashboardView({ data, invoices, userName }: { data: DashboardData; invoices: InvoiceRow[]; userName: string }) {
  const m = data.mandates.find((x) => x.status === 'active');
  const cur = m?.currency ?? 'USD';
  const sum = (f: (i: InvoiceRow) => boolean) => invoices.filter(f).reduce((s, i) => s + (i.amountCents ?? 0), 0);
  const count = (f: (i: InvoiceRow) => boolean) => invoices.filter(f).length;

  const waiting = invoices.filter((i) => i.status === 'AWAITING_APPROVAL');
  const blocked = invoices.filter((i) => i.verdict === 'DENY');
  const paidOut = m?.paidCents ?? 0;
  const used = (m?.paidCents ?? 0) + (m?.inFlightCents ?? 0);
  const remaining = m ? Math.max(0, m.budgetCents - used) : 0;
  const pctUsed = m ? Math.round((used / m.budgetCents) * 100) : 0;
  const bar = (cents: number) => (m ? Math.min(100, (cents / m.budgetCents) * 100) : 0);

  // Cumulative value by outcome across the most recent invoices, oldest first.
  const recent = [...invoices].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-14);
  const cum = (f: (i: InvoiceRow) => boolean) => { let t = 0; return recent.map((i) => (t += f(i) ? i.amountCents ?? 0 : 0)); };
  const series: ChartSeries[] = [
    { name: 'Approved & paid', color: '#c3f550', values: cum((i) => i.verdict === 'ALLOW' || i.status === 'PAID') },
    { name: 'Needs approval', color: '#7280ff', values: cum((i) => i.verdict === 'ESCALATE') },
    { name: 'Blocked', color: '#b44cf5', values: cum((i) => i.verdict === 'DENY') },
  ];
  const labels = recent.map((i) => dateTime(i.createdAt));
  const total = (s: ChartSeries) => s.values[s.values.length - 1] ?? 0;

  const tone = (i: InvoiceRow) => (i.verdict === 'DENY' || i.status === 'PAYMENT_FAILED' ? 'bad' : i.status === 'AWAITING_APPROVAL' ? 'warn' : 'good');
  const label = (i: InvoiceRow) => (i.status === 'PAID' ? 'Paid' : i.status === 'PAYMENT_PENDING' ? 'Queued' : i.status === 'AWAITING_APPROVAL' ? 'Needs approval' : i.status === 'PAYMENT_FAILED' ? 'Failed' : i.status === 'CANCELED' ? 'Canceled' : 'Blocked');

  return (
    <>
      <header className="page-head">
        <div><h1>Welcome, {userName.split(' ')[0]}!</h1><p>What your agents may spend, and what they have spent.</p></div>
        <div className="actions">
          <Chip><i />PayPal {data.paypalMode}</Chip>
          <Chip>AI: {data.aiMode === 'mock' ? 'offline parser' : data.aiMode === 'gemini' ? 'Gemini' : 'Claude'}</Chip>
          <Chip>Cancel window {data.holdSeconds >= 60 ? `${Math.round(data.holdSeconds / 60)} min` : `${data.holdSeconds}s`}</Chip>
        </div>
      </header>

      <div className="dash">
        <div className="dash-main">
          <div className="dash-top">
            <div className="stat-col">
              <div className="stat">
                <div className="stat-label">Paid out</div>
                <div className="stat-value"><Money cents={paidOut} currency={cur} /></div>
                <div className="bar"><i style={{ clipPath: `inset(0 ${100 - bar(paidOut)}% 0 0)` }} /></div>
                <BarTicks budget={m?.budgetCents ?? 0} currency={cur} />
              </div>
              <div className="stat">
                {waiting.length > 0 && <span className="pill-badge">{waiting.length} waiting</span>}
                <div className="stat-label">Needs your approval</div>
                <div className="stat-value"><Money cents={sum((i) => i.status === 'AWAITING_APPROVAL')} currency={cur} /></div>
                <div className="bar"><i style={{ clipPath: `inset(0 ${100 - bar(sum((i) => i.status === 'AWAITING_APPROVAL'))}% 0 0)` }} /></div>
                <BarTicks budget={m?.budgetCents ?? 0} currency={cur} />
              </div>
            </div>

            <section className="card hero">
              {m ? (
                <>
                  <span className="hero-label">Remaining spending authority</span>
                  <span className="hero-value"><Money cents={remaining} currency={cur} /></span>
                  <span className="hero-sub">of {money(m.budgetCents, cur)} · {m.name} · {pctUsed}% used</span>
                  <div className="row" style={{ justifyContent: 'center' }}>
                    <Link href="/invoices" className="btn btn-primary btn-pill">Submit invoice</Link>
                    <Link href="/mandates" className="btn btn-pill">View mandate</Link>
                  </div>
                </>
              ) : (
                <>
                  <span className="hero-label">No active mandate</span>
                  <span className="hero-sub">Agents can’t spend until a mandate is created and a second person activates it.</span>
                  <Link href="/mandates" className="btn btn-primary btn-pill">Create a mandate</Link>
                </>
              )}
            </section>
          </div>

          <section className="card chart-card">
            <div className="chart-head">
              <div className="chart-title">Activity<br />overview</div>
              <span className="muted">Cumulative value of the last {recent.length} invoices, by outcome</span>
            </div>
            {recent.length >= 2 ? (
              <div className="chart-body">
                <div className="legend">
                  {series.map((s) => (
                    <div key={s.name} className="legend-item"><i className="dot-c" style={{ background: s.color }} /><b className="num">{money(total(s), cur)}</b><span>{s.name}</span></div>
                  ))}
                  <div className="legend-item"><i className="dot-c" style={{ background: '#2a3050' }} /><b className="num">{money(sum(() => true), cur)}</b><span>Total · {count(() => true)}</span></div>
                </div>
                <ActivityChart series={series} labels={labels} currency={cur} />
              </div>
            ) : <p className="muted" style={{ padding: '30px 0' }}>Submit a few invoices (or run the Playground) and the activity chart appears here.</p>}
          </section>
        </div>

        <aside className="tx-panel">
          <div className="tx-head"><h2>Transactions</h2><Link href="/invoices" className="muted">View all →</Link></div>
          <div className="tx-list">
            {invoices.length === 0 && <div className="card empty">No invoices yet.</div>}
            {invoices.slice(0, 8).map((i) => (
              <Link key={i.id} href={`/invoices/${i.id}`} className={`tx t-${tone(i)}`}>
                <Avatar name={i.vendorName ?? '?'} />
                <div><b>{i.vendorName ?? 'Unreadable document'}</b><small>{i.invoiceNumber ?? 'No number'} · {dateTime(i.createdAt)}</small></div>
                <div className="amt num">{money(i.amountCents, i.currency ?? cur)}<small>{label(i)}</small></div>
              </Link>
            ))}
          </div>
          {blocked.length > 0 && <p className="hint" style={{ marginTop: 14 }}>{blocked.length} invoice{blocked.length === 1 ? '' : 's'} blocked, {compactMoney(sum((i) => i.verdict === 'DENY'), cur)} kept from leaving.</p>}
        </aside>
      </div>
    </>
  );
}

function BarTicks({ budget, currency }: { budget: number; currency: string }) {
  return <div className="bar-ticks num">{[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{compactMoney(budget * f, currency)}</span>)}</div>;
}

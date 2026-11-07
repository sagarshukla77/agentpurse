'use client';
import Link from 'next/link';
import { useState } from 'react';
import { can } from '@/core/security/rbac';
import { api } from '@/lib/api';
import type { DashboardData, FixtureItem, IngestResponse } from '@/lib/dto';
import { useApi, useMe } from '@/lib/hooks';
import { Badge, Button, Card, Field, Loading, Notice, PageHead } from '@/components/ui';
import { VerdictBadge } from '@/components/domain/badges';

type Item = FixtureItem & { text: string };
type Result = IngestResponse & { matched: boolean };

export default function Playground() {
  const fixtures = useApi<Item[]>('/api/fixtures');
  const dash = useApi<DashboardData>('/api/dashboard');
  const me = useMe();
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<string | null>(null);
  const [mandateId, setMandateId] = useState('');
  const active = (dash.data?.mandates ?? []).filter((m) => m.status === 'active');
  const mid = mandateId || active[0]?.id || '';

  async function run(f: Item) {
    setBusy(f.file); setError(null);
    try {
      const r = await api<IngestResponse>('/api/fixtures', { body: { file: f.file, mandateId: mid } });
      setResults((x) => ({ ...x, [f.file]: { ...r, matched: r.verdict === f.expect } }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setBusy(null);
  }
  async function resetAll() {
    if (!confirm('Clear all demo invoices and payments so you can run the Playground again? Vendors, mandates and the audit trail are kept.')) return;
    setError(null);
    try { await api('/api/admin/reset-demo', { method: 'POST', body: {} }); setResults({}); await dash.reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Reset failed'); }
  }
  async function runAll() { for (const f of fixtures.data ?? []) await run(f); }

  return (
    <>
      <PageHead title="Playground" sub="Twelve realistic invoices, each built to test one rule. Run them through the real pipeline.">
        <select className="select" style={{ width: 240 }} value={mid} onChange={(e) => setMandateId(e.target.value)} aria-label="Mandate">{active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        {dash.data?.demoMode && me.data && can(me.data.role, 'demo:reset') && <Button onClick={resetAll} disabled={!!busy}>Reset demo data</Button>}
        <Button variant="primary" onClick={runAll} disabled={!!busy || !mid}>Run all in order</Button>
      </PageHead>
      {error && <Notice tone="bad">{error}</Notice>}
      <Notice tone="info">Run them in order: some depend on earlier ones (the duplicate needs the original to exist first). Running them twice flags the second run as duplicates (which is the point); use Reset demo data to start over.</Notice>
      <div className="stack" style={{ marginTop: 16 }}>
        {fixtures.loading ? <Loading /> : (fixtures.data ?? []).map((f) => {
          const r = results[f.file];
          return (
            <Card key={f.file}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="stack-sm">
                  <div className="row"><h3>{f.title}</h3><span className="faint">expected</span><VerdictBadge v={f.expect} /></div>
                  <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start', padding: 0 }} onClick={() => setShow(show === f.file ? null : f.file)}>{show === f.file ? 'Hide document' : 'View document'}</button>
                </div>
                <div className="row">
                  {r && <><VerdictBadge v={r.verdict === 'NEEDS_REVIEW' ? undefined : r.verdict} /><Badge tone={r.matched ? 'good' : 'bad'}>{r.matched ? 'as expected' : 'unexpected'}</Badge><Link className="btn btn-sm" href={`/invoices/${r.invoiceId}`}>Open</Link></>}
                  <Button size="sm" onClick={() => run(f)} disabled={!!busy || !mid}>{busy === f.file ? 'Running…' : 'Run'}</Button>
                </div>
              </div>
              {show === f.file && <pre className="doc" style={{ marginTop: 12 }}>{f.text}</pre>}
              {r && <p className="muted" style={{ marginTop: 10 }}>{r.explanation ?? r.reasons.map((x) => x.detail).join(' ')}</p>}
            </Card>
          );
        })}
      </div>
    </>
  );
}

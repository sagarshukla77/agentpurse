'use client';
import { useState } from 'react';
import { can } from '@/core/security/rbac';
import { api } from '@/lib/api';
import type { MandateRow, ReplayResponse, VendorRow } from '@/lib/dto';
import { dateOnly, money } from '@/lib/format';
import { useAction, useApi, useMe } from '@/lib/hooks';
import { Badge, Button, Card, Empty, Field, Loading, Notice, PageHead, useToast } from '@/components/ui';
import { MandateRail } from '@/components/domain/MandateRail';

export default function MandatesPage() {
  const me = useMe();
  const toast = useToast();
  const list = useApi<MandateRow[]>('/api/mandates', { refreshMs: 6000 });
  const vendors = useApi<VendorRow[]>('/api/vendors');
  const role = me.data?.role;
  const [creating, setCreating] = useState(false);

  const act = useAction(async (id: string, action: 'activate' | 'suspend') => { await api(`/api/mandates/${id}`, { body: { action } }); toast(action === 'activate' ? 'Mandate is now live' : 'Mandate suspended'); await list.reload(); });

  return (
    <>
      <PageHead title="Mandates" sub="The spending authority you delegate: a budget, hard limits, and a list of approved vendors.">
        {role && can(role, 'mandate:create') && <Button variant="primary" onClick={() => setCreating(!creating)}>{creating ? 'Close' : 'New mandate'}</Button>}
      </PageHead>
      <div className="stack">
        {creating && vendors.data && <NewMandate vendors={vendors.data.filter((v) => v.status === 'verified')} onDone={() => { setCreating(false); void list.reload(); }} />}
        {act.error && <Notice tone="bad">{act.error}</Notice>}
        {list.loading ? <Loading /> : !list.data?.length ? <Card><Empty>No mandates yet.</Empty></Card> : list.data.map((m) => (
          <Card key={m.id}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="row"><h2>{m.name}</h2><Badge tone={m.status === 'active' ? 'good' : m.status === 'suspended' ? 'bad' : 'warn'}>{m.status.replace('_', ' ')}</Badge></div>
              <div className="row">
                {m.status === 'pending_activation' && role && can(role, 'mandate:activate') && <Button size="sm" variant="good" onClick={() => act.run(m.id, 'activate')}>Activate</Button>}
                {m.status === 'active' && role && can(role, 'mandate:activate') && <Button size="sm" variant="danger" onClick={() => confirm('Suspend this mandate? Agents will be refused.') && act.run(m.id, 'suspend')}>Suspend</Button>}
              </div>
            </div>
            <MandateRail m={m} large />
            <p className="hint" style={{ marginTop: 12 }}>{m.vendorIds.length} approved vendor(s) · up to {m.velocityMaxPerHour} payments/hour · expires {dateOnly(m.expiresAt)}{m.status === 'pending_activation' ? ' · a second person must activate this before it takes effect' : ''}</p>
            {m.status === 'active' && <DryRun m={m} />}
          </Card>
        ))}
      </div>
    </>
  );
}

function NewMandate({ vendors, onDone }: { vendors: VendorRow[]; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', budget: '5000', cap: '1500', threshold: '800', velocity: '5', days: '30' });
  const [picked, setPicked] = useState<string[]>(vendors.map((v) => v.id));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const create = useAction(async () => {
    await api('/api/mandates', { body: {
      name: f.name, currency: 'USD', budgetCents: Math.round(Number(f.budget) * 100), perPaymentCapCents: Math.round(Number(f.cap) * 100),
      approvalThresholdCents: Math.round(Number(f.threshold) * 100), velocityMaxPerHour: Number(f.velocity),
      expiresAt: new Date(Date.now() + Number(f.days) * 86_400_000).toISOString(), vendorIds: picked,
    } });
    toast('Mandate drafted. A second person must activate it.'); onDone();
  });
  return (
    <Card title="Draft a mandate">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void create.run(); }}>
        {create.error && <Notice tone="bad">{create.error}</Notice>}
        <div className="form-grid">
          <Field label="Name"><input className="input" required value={f.name} onChange={set('name')} placeholder="Operations: December" /></Field>
          <Field label="Total budget (USD)"><input className="input num" type="number" min="1" required value={f.budget} onChange={set('budget')} /></Field>
          <Field label="Hard cap per payment"><input className="input num" type="number" min="1" required value={f.cap} onChange={set('cap')} /></Field>
          <Field label="Auto-approve up to" hint="Above this, a person must approve."><input className="input num" type="number" min="0" required value={f.threshold} onChange={set('threshold')} /></Field>
          <Field label="Max payments per hour"><input className="input num" type="number" min="1" required value={f.velocity} onChange={set('velocity')} /></Field>
          <Field label="Valid for (days)"><input className="input num" type="number" min="1" required value={f.days} onChange={set('days')} /></Field>
        </div>
        <Field label="Approved vendors" hint="Only verified vendors can be listed.">
          <div className="row">{vendors.map((v) => (
            <label key={v.id} className="chip" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.includes(v.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, v.id] : picked.filter((x) => x !== v.id))} /> {v.name}
            </label>))}</div>
        </Field>
        <div><Button variant="primary" type="submit" disabled={create.pending}>Create draft</Button></div>
      </form>
    </Card>
  );
}

/** "What if?" — replay the last 30 days of decisions against edited limits before changing anything. */
function DryRun({ m }: { m: MandateRow }) {
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState(String(m.perPaymentCapCents / 100));
  const [thr, setThr] = useState(String(m.approvalThresholdCents / 100));
  const [budget, setBudget] = useState(String(m.budgetCents / 100));
  const run = useAction(() => api<ReplayResponse>(`/api/mandates/${m.id}/dry-run`, { body: { perPaymentCapCents: Math.round(Number(cap) * 100), approvalThresholdCents: Math.round(Number(thr) * 100), budgetCents: Math.round(Number(budget) * 100) } }));
  const [res, setRes] = useState<ReplayResponse | null>(null);
  if (!open) return <div style={{ marginTop: 12 }}><Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Test different limits (dry run)</Button></div>;
  return (
    <div className="stack-sm" style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <h3>What would the last 30 days have looked like?</h3>
      <div className="form-grid">
        <Field label="Budget"><input className="input num" type="number" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
        <Field label="Cap per payment"><input className="input num" type="number" value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
        <Field label="Auto-approve up to"><input className="input num" type="number" value={thr} onChange={(e) => setThr(e.target.value)} /></Field>
      </div>
      <div><Button size="sm" onClick={async () => setRes((await run.run()) ?? null)} disabled={run.pending}>Replay</Button></div>
      {run.error && <Notice tone="bad">{run.error}</Notice>}
      {res && <Notice tone={res.changed ? 'warn' : 'good'}>{res.rows.length} past decisions replayed. <b>{res.changed}</b> would have gone differently. Result: {res.counts.ALLOW} allowed, {res.counts.ESCALATE} needing approval, {res.counts.DENY} blocked. (Nothing was changed; approximate because human approvals are not replayed.)</Notice>}
    </div>
  );
}

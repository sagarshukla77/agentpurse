'use client';
import { useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { api } from '@/lib/api';
import type { AuditEvent } from '@/lib/dto';
import { actionText, actionTone, dateTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { Badge, Button, Card, Loading, Notice, PageHead } from '@/components/ui';
import { DataGrid } from '@/components/ui/DataGrid';

interface Verification { ok: boolean; checked: number; head: string | null; brokenSeq: number | null; reason?: string }

export default function AuditPage() {
  const list = useApi<AuditEvent[]>('/api/audit?limit=500', { refreshMs: 8000 });
  const [q, setQ] = useState('');
  const [result, setResult] = useState<Verification | null>(null);
  const verify = useAction(async () => setResult(await api<Verification>('/api/audit/verify')));

  const columns: ColDef<AuditEvent>[] = [
    { headerName: '#', field: 'seq', flex: 0.4, minWidth: 70, sort: 'desc' },
    { headerName: 'When', field: 'ts', flex: 0.9, valueFormatter: (p) => dateTime(p.value) },
    { headerName: 'What happened', field: 'action', flex: 1.6, cellRenderer: (p: { value: string }) => <Badge tone={actionTone(p.value)}>{actionText(p.value)}</Badge> },
    { headerName: 'By', field: 'actorKind', flex: 0.6 },
    { headerName: 'Subject', field: 'subjectType', flex: 0.7, valueFormatter: (p) => p.value ?? '–' },
    { headerName: 'Detail', field: 'detail', flex: 2, valueFormatter: (p) => JSON.stringify(p.value), tooltipField: 'detail' },
    { headerName: 'Hash', field: 'hash', flex: 1, cellClass: 'mono', valueFormatter: (p) => `${String(p.value).slice(0, 14)}…` },
  ];

  return (
    <>
      <PageHead title="Audit trail" sub="Every decision and action, chained by hash. Edit or delete one row and the chain visibly breaks.">
        <input className="input" style={{ width: 220 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit trail" />
        <Button variant="primary" onClick={() => verify.run()} disabled={verify.pending}>{verify.pending ? 'Verifying…' : 'Verify integrity'}</Button>
      </PageHead>
      <div className="stack">
        {verify.error && <Notice tone="bad">{verify.error}</Notice>}
        {result && (result.ok
          ? <Notice tone="good"><div><b>Chain intact.</b> {result.checked} events verified from the first entry to the latest.<br /><span className="mono">head {result.head}</span></div></Notice>
          : <Notice tone="bad"><div><b>Tampering detected at event #{result.brokenSeq}.</b> {result.reason}</div></Notice>)}
        <Card pad={false}>{list.loading ? <Loading /> : <div style={{ padding: 14 }}><DataGrid rows={list.data ?? []} columns={columns} exportName="audit-trail" quickFilter={q} getRowId={(r) => r.id} height={560} /></div>}</Card>
        <p className="hint">Tamper-evident, not tamper-proof: someone with full database access could rebuild the chain. For production, anchor the head hash somewhere the app cannot write.</p>
      </div>
    </>
  );
}

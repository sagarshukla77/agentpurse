'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { can } from '@/core/security/rbac';
import type { DashboardData, InvoiceRow } from '@/lib/dto';
import { dateTime, money } from '@/lib/format';
import { useApi, useMe } from '@/lib/hooks';
import { Button, Empty, Loading, Notice, PageHead } from '@/components/ui';
import { DataGrid } from '@/components/ui/DataGrid';
import { InvoiceStatusBadge, PaymentStatusBadge, VerdictBadge } from '@/components/domain/badges';
import { SubmitInvoice } from '@/components/domain/SubmitInvoice';

export default function InvoicesPage() {
  const router = useRouter();
  const me = useMe();
  const list = useApi<InvoiceRow[]>('/api/invoices', { refreshMs: 5000 });
  const dash = useApi<DashboardData>('/api/dashboard');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const columns: ColDef<InvoiceRow>[] = [
    { headerName: 'Received', field: 'createdAt', valueFormatter: (p) => dateTime(p.value), sort: 'desc', minWidth: 140, flex: 0.8 },
    { headerName: 'Vendor', field: 'vendorName', flex: 1.4, valueFormatter: (p) => p.value ?? 'Unreadable document' },
    { headerName: 'Invoice #', field: 'invoiceNumber', flex: 0.8, valueFormatter: (p) => p.value ?? '–' },
    { headerName: 'Amount', field: 'amountCents', type: 'rightAligned', cellClass: 'num', valueFormatter: (p) => money(p.value, p.data?.currency ?? 'USD'), flex: 0.8 },
    { headerName: 'Source', field: 'source', flex: 0.6, valueFormatter: (p) => (p.data?.submittedByKind === 'agent' ? 'AI agent' : p.value) },
    { headerName: 'Policy', field: 'verdict', cellRenderer: (p: { data?: InvoiceRow }) => <VerdictBadge v={p.data?.verdict} />, flex: 0.9 },
    { headerName: 'Payment', field: 'paymentStatus', cellRenderer: (p: { data?: InvoiceRow }) => <PaymentStatusBadge s={p.data?.paymentStatus} />, flex: 1 },
    { headerName: 'Status', field: 'status', cellRenderer: (p: { data?: InvoiceRow }) => p.data && <InvoiceStatusBadge s={p.data.status} />, flex: 1 },
  ];

  return (
    <>
      <PageHead title="Invoices" sub="Everything the AI has read, and what the rules decided.">
        <input className="input" style={{ width: 220 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search invoices" />
        {me.data && can(me.data.role, 'invoice:submit') && <Button variant="primary" onClick={() => setOpen(true)}>Submit invoice</Button>}
      </PageHead>
      {list.error && <Notice tone="bad">{list.error}</Notice>}
      {list.loading ? <Loading /> : !list.data?.length ? <Empty>No invoices yet. Submit one, or try the <a href="/playground">playground</a>.</Empty> : (
        <DataGrid rows={list.data} columns={columns} exportName="invoices" quickFilter={q} getRowId={(r) => r.id} onRowClick={(r) => router.push(`/invoices/${r.id}`)} height={620} />
      )}
      {open && dash.data && <SubmitInvoice mandates={dash.data.mandates} onClose={() => setOpen(false)} onDone={() => list.reload()} />}
    </>
  );
}

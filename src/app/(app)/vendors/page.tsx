'use client';
import { useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { can } from '@/core/security/rbac';
import { api } from '@/lib/api';
import type { VendorRow } from '@/lib/dto';
import { dateOnly } from '@/lib/format';
import { useAction, useApi, useMe } from '@/lib/hooks';
import { Badge, Button, Card, Field, Loading, Notice, PageHead, useToast } from '@/components/ui';
import { DataGrid } from '@/components/ui/DataGrid';
import { ReviewVendor } from '@/components/domain/ReviewVendor';

const TONE = { verified: 'good', pending: 'warn', blocked: 'bad' } as const;

export default function VendorsPage() {
  const me = useMe();
  const toast = useToast();
  const list = useApi<VendorRow[]>('/api/vendors');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const add = useAction(async () => { await api('/api/vendors', { body: { name, payeeEmail: email } }); setName(''); setEmail(''); toast('Vendor added as PENDING. It cannot be paid until a second person verifies it.'); await list.reload(); });
  const [reviewing, setReviewing] = useState<{ vendor: VendorRow; action: 'verify' | 'block' } | null>(null);
  const role = me.data?.role;

  const columns: ColDef<VendorRow>[] = [
    { headerName: 'Vendor', field: 'name', flex: 1.4 },
    { headerName: 'Status', field: 'status', cellRenderer: (p: { value: VendorRow['status'] }) => <Badge tone={TONE[p.value]}>{p.value}</Badge>, flex: 0.8 },
    { headerName: 'Added by', field: 'createdByName', flex: 0.9, valueFormatter: (p) => p.value ?? '–' },
    { headerName: 'Verified by', field: 'verifiedByName', flex: 0.9, valueFormatter: (p) => p.value ?? '–' },
    { headerName: 'Verified', field: 'verifiedAt', flex: 0.8, valueFormatter: (p) => dateOnly(p.value) },
    { headerName: 'Paid invoices', field: 'paidCount', flex: 0.7, cellClass: 'num' },
    { headerName: 'How it was verified', field: 'verificationNote', flex: 1.6, valueFormatter: (p) => p.value ?? '–' },
    { headerName: '', colId: 'actions', sortable: false, filter: false, flex: 1, cellRenderer: (p: { data?: VendorRow }) => p.data && role && can(role, 'vendor:verify') && p.data.status !== 'blocked' ? (
      <div className="row" style={{ height: '100%' }}>
        {p.data.status === 'pending' && <Button size="sm" variant="good" onClick={() => setReviewing({ vendor: p.data!, action: 'verify' })}>Verify</Button>}
        <Button size="sm" onClick={() => setReviewing({ vendor: p.data!, action: 'block' })}>Block</Button>
      </div>) : null },
  ];

  return (
    <>
      <PageHead title="Vendors" sub="The only places money can go. Each payee is confirmed by someone other than the person who added it." />
      <div className="stack">
        {role && can(role, 'vendor:create') && (
          <Card title="Add a vendor">
            <form className="stack" onSubmit={(e) => { e.preventDefault(); void add.run(); }}>
              {add.error && <Notice tone="bad">{add.error}</Notice>}
              <div className="form-grid">
                <Field label="Vendor name"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="PayPal email" hint="Only people who verify vendors can see the full address. Sandbox: use a sandbox personal account."><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              </div>
              <div><Button variant="primary" type="submit" disabled={add.pending}>Add vendor</Button></div>
            </form>
          </Card>
        )}
        {list.loading ? <Loading /> : <DataGrid rows={list.data ?? []} columns={columns} exportName="vendors" getRowId={(r) => r.id} height={420} />}
      </div>
      {reviewing && <ReviewVendor vendor={reviewing.vendor} action={reviewing.action} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); void list.reload(); }} />}
    </>
  );
}

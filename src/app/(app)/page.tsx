'use client';
import type { DashboardData, InvoiceRow } from '@/lib/dto';
import { useApi, useMe } from '@/lib/hooks';
import { Loading, Notice } from '@/components/ui';
import { DashboardView } from '@/components/domain/DashboardView';

export default function ControlRoom() {
  const me = useMe();
  const dash = useApi<DashboardData>('/api/dashboard', { refreshMs: 5000 });
  const invoices = useApi<InvoiceRow[]>('/api/invoices', { refreshMs: 5000 });
  if (dash.loading || invoices.loading || !me.data) return <Loading />;
  if (dash.error || !dash.data) return <Notice tone="bad">{dash.error ?? 'Could not load the dashboard'}</Notice>;
  return <DashboardView data={dash.data} invoices={invoices.data ?? []} userName={me.data.name} />;
}

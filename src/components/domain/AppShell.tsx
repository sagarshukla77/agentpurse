'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { can } from '@/core/security/rbac';
import { api } from '@/lib/api';
import type { DashboardData } from '@/lib/dto';
import { useApi, useMe } from '@/lib/hooks';
import { Button, Loading, useToast } from '../ui';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const toast = useToast();
  const me = useMe();
  const dash = useApi<DashboardData>('/api/dashboard', { refreshMs: 8000 });
  if (me.loading || !me.data) return <Loading />;
  const user = me.data;
  const frozen = dash.data?.killSwitch;

  const setFreeze = async (action: 'engage' | 'release') => {
    try { await api('/api/kill-switch', { body: { action, reason: 'Frozen from the control room' } }); await dash.reload(); toast(action === 'engage' ? 'All payments frozen' : 'Payments resumed'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', true); }
  };

  return (
    <div className="shell">
      <Sidebar path={path} user={user} pending={dash.data?.pendingApprovals ?? 0}
        onSignOut={async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); window.location.assign('/login'); }} />
      <div className="main">
        {frozen?.engaged && (
          <div className="freeze" role="alert">
            <span>⛔ Payments are frozen{frozen.reason ? `: ${frozen.reason}` : ''}. Nothing will leave until an owner resumes.</span>
            {can(user.role, 'killswitch:release') && <Button size="sm" onClick={() => setFreeze('release')}>Resume payments</Button>}
          </div>
        )}
        <main className="page">
          <FreezeControl show={!frozen?.engaged && can(user.role, 'killswitch:engage')} onFreeze={() => setFreeze('engage')} />
          {children}
        </main>
      </div>
    </div>
  );
}

function FreezeControl({ show, onFreeze }: { show: boolean; onFreeze: () => void }) {
  if (!show) return null;
  return (
    <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
      <Button size="sm" variant="danger" onClick={() => { if (confirm('Freeze ALL payments immediately?')) onFreeze(); }}>⛔ Kill switch</Button>
    </div>
  );
}

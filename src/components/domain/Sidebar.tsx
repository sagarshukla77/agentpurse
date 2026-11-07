import Link from 'next/link';
import { can, type Permission } from '@/core/security/rbac';
import type { Me } from '@/lib/dto';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui';
import { ICONS, type IconName } from '../ui/icons';

const NAV: { href: string; label: string; icon: IconName; badge?: boolean; needs?: Permission }[] = [
  { href: '/', label: 'Control room', icon: 'home' },
  { href: '/invoices', label: 'Invoices', icon: 'invoices' },
  { href: '/approvals', label: 'Approvals', icon: 'approvals', badge: true },
  { href: '/vendors', label: 'Vendors', icon: 'vendors' },
  { href: '/mandates', label: 'Mandates', icon: 'mandates' },
  { href: '/agents', label: 'AI agents', icon: 'agents', needs: 'agent:manage' },
  { href: '/audit', label: 'Audit trail', icon: 'audit' },
  { href: '/playground', label: 'Playground', icon: 'playground', needs: 'invoice:submit' },
];

/** Presentational only: all state comes in through props, so it renders the same anywhere. */
export function Sidebar({ path, user, pending, onSignOut }: { path: string; user: Me; pending: number; onSignOut: () => void }) {
  return (
    <aside className="side">
      <div className="brand"><span className="brand-mark"><i /></span>AgentPurse</div>
      <nav className="nav" aria-label="Main">
        <div className="nav-label">Workspace</div>
        {NAV.filter((n) => !n.needs || can(user.role, n.needs)).map((n) => (
          <Link key={n.href} href={n.href} aria-current={(n.href === '/' ? path === '/' : path.startsWith(n.href)) ? 'page' : undefined}>
            {ICONS[n.icon]}{n.label}
            {n.badge && pending > 0 && <span className="count">{pending}</span>}
          </Link>
        ))}
      </nav>
      <div className="side-foot">
        <div className="user-chip"><Avatar name={user.name} /><div><div className="who">{user.name}</div><div className="role">{user.role}</div></div></div>
        <Button size="sm" onClick={onSignOut}>Sign out</Button>
      </div>
    </aside>
  );
}

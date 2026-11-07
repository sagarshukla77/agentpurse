import { money } from '@/lib/format';

/** "$12,345.00" with the cents dimmed, the way a finance dashboard shows it. */
export function Money({ cents, currency = 'USD', className = '' }: { cents: number; currency?: string; className?: string }) {
  const s = money(cents, currency);
  const i = s.lastIndexOf('.');
  return <span className={`money num ${className}`}>{i < 0 ? s : <>{s.slice(0, i)}<span className="cents">{s.slice(i)}</span></>}</span>;
}

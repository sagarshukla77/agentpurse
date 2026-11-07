/** Vendor-name matching against the registry. The registry, never the invoice, owns the payee. */
const SUFFIXES = /\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|pvt|private|llp|plc)\b/g;

export const normalizeName = (s: string): string =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim();

export const normalizeEmail = (s: string): string => s.trim().toLowerCase();

export function matchVendor<T extends { id: string; name: string }>(name: string, registry: T[]): T | null {
  const n = normalizeName(name);
  if (!n) return null;
  return registry.find((v) => normalizeName(v.name) === n) ?? null;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

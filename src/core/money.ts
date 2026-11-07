/**
 * Money is always an integer number of minor units (cents). Floats never touch it.
 */
export class MoneyError extends Error {}

export function toCents(input: string | number): number {
  const s = (typeof input === 'number' ? String(input) : input).trim().replace(/,/g, '');
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new MoneyError(`Invalid amount: ${String(input)}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) throw new MoneyError('Amount out of range');
  return m[1] ? -cents : cents;
}

/** "1234.50" — the format PayPal expects. */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new MoneyError('Invalid cents');
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export const normalizeCurrency = (c: string): string => c.trim().toUpperCase();

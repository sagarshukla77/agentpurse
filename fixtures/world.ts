/**
 * The demo world. Used by scripts/seed.ts to populate the database and by
 * tests/fixtures.test.ts as the in-memory world, so the tests prove what the demo shows.
 */
export const MANDATE = {
  name: 'Operations: November',
  currency: 'USD',
  budgetCents: 500_000,
  perPaymentCapCents: 150_000,
  approvalThresholdCents: 80_000,
  velocityMaxPerHour: 5,
} as const;

export interface WorldVendor {
  key: string;
  name: string;
  status: 'verified' | 'pending';
  allowlisted: boolean;
  /** Past paid invoices, in cents. Seeded as PAID so "first payment" and anomaly rules have history. */
  paidHistoryCents: number[];
}

export const VENDORS: WorldVendor[] = [
  { key: 'northwind', name: 'Northwind Design Studio', status: 'verified', allowlisted: true, paidHistoryCents: [42_000, 45_000, 48_000] },
  { key: 'acme', name: 'Acme Cloud Hosting', status: 'verified', allowlisted: true, paidHistoryCents: [60_000, 62_000, 64_000] },
  { key: 'lumen', name: 'Lumen Legal LLP', status: 'verified', allowlisted: true, paidHistoryCents: [] },
  { key: 'pixel', name: 'Pixel Freelance Collective', status: 'pending', allowlisted: false, paidHistoryCents: [] },
];

/** Default payout emails. For real sandbox payouts, set DEMO_VENDOR_EMAIL_<KEY> to sandbox personal accounts. */
export const defaultVendorEmail = (key: string): string => `${key}@vendors.example.test`;

type Env = Record<string, string | undefined>;

/** The payee email the seed script registered for a vendor (real sandbox email if you set one). */
export const vendorEmail = (key: string, env: Env = {}): string =>
  env[`DEMO_VENDOR_EMAIL_${key.toUpperCase()}`]?.trim() || defaultVendorEmail(key);

/**
 * Fixture documents say {{email:northwind}} instead of a hard-coded address, so the invoice always
 * shows the SAME payee the registry holds. (Otherwise every demo invoice would look like a payee change.)
 */
export const renderFixture = (text: string, env: Env = {}): string =>
  text.replace(/\{\{email:(\w+)\}\}/g, (_, key: string) => vendorEmail(key, env));

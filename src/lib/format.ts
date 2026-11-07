import type { Verdict, InvoiceStatus, PaymentStatus } from '@/core/types';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

export const money = (cents: number | null | undefined, currency = 'USD'): string =>
  cents == null ? '–' : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

export const dateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–';
export const dateOnly = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '–';

export function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  ALLOW: { label: 'Allowed', tone: 'good' }, ESCALATE: { label: 'Needs approval', tone: 'warn' }, DENY: { label: 'Blocked', tone: 'bad' },
};
export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  PAYMENT_PENDING: { label: 'Payment queued', tone: 'info' }, AWAITING_APPROVAL: { label: 'Needs approval', tone: 'warn' },
  PAID: { label: 'Paid', tone: 'good' }, REJECTED: { label: 'Blocked', tone: 'bad' }, PAYMENT_FAILED: { label: 'Payment failed', tone: 'bad' },
  CANCELED: { label: 'Canceled', tone: 'neutral' }, NEEDS_REVIEW: { label: 'Needs review', tone: 'warn' },
};
export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  QUEUED: { label: 'Holding (can cancel)', tone: 'info' }, SUBMITTING: { label: 'Sending', tone: 'info' }, UNKNOWN: { label: 'Confirming', tone: 'warn' },
  SUBMITTED: { label: 'Sent to PayPal', tone: 'info' }, PAID: { label: 'Paid', tone: 'good' }, FAILED: { label: 'Failed', tone: 'bad' },
  BLOCKED: { label: 'Blocked by PayPal', tone: 'bad' }, RETURNED: { label: 'Returned', tone: 'bad' }, CANCELED: { label: 'Canceled', tone: 'neutral' },
};

/** Audit action → a sentence a finance person would write. */
const ACTIONS: Record<string, { text: string; tone?: Tone }> = {
  INVOICE_RECEIVED: { text: 'Invoice received' }, INVOICE_EXTRACTED: { text: 'AI read the invoice' }, RISK_ASSESSED: { text: 'Risk checks ran' },
  POLICY_DECIDED: { text: 'Policy engine decided' }, INVOICE_REJECTED: { text: 'Invoice blocked', tone: 'bad' }, INVOICE_UNREADABLE: { text: 'Could not read the document', tone: 'warn' },
  APPROVAL_REQUESTED: { text: 'Sent for human approval', tone: 'warn' }, APPROVAL_GRANTED: { text: 'Approved by a person', tone: 'good' }, APPROVAL_REJECTED: { text: 'Rejected by a person', tone: 'bad' },
  PAYMENT_QUEUED: { text: 'Payment queued (cancel window open)' }, PAYMENT_CANCELED: { text: 'Payment canceled before sending', tone: 'neutral' },
  PAYMENT_SUBMITTED: { text: 'Sent to PayPal' }, PAYMENT_PAID: { text: 'PayPal confirmed payment', tone: 'good' }, PAYMENT_FAILED: { text: 'Payment failed', tone: 'bad' },
  PAYMENT_BLOCKED: { text: 'PayPal blocked the payment', tone: 'bad' }, PAYMENT_RETURNED: { text: 'Payment returned', tone: 'bad' },
  PAYMENT_OUTCOME_UNKNOWN: { text: 'Could not confirm delivery; will retry safely', tone: 'warn' }, PAYMENT_RECOVERED: { text: 'Recovered after an interruption', tone: 'warn' },
  PAYMENT_HELD_BY_KILL_SWITCH: { text: 'Held by the kill switch', tone: 'bad' },
  KILL_SWITCH_ENGAGED: { text: 'Kill switch engaged', tone: 'bad' }, KILL_SWITCH_RELEASED: { text: 'Kill switch released', tone: 'good' },
  LOGIN_OK: { text: 'Signed in' }, LOGIN_FAILED: { text: 'Failed sign-in', tone: 'warn' },
  VENDOR_CREATED: { text: 'Vendor added' }, VENDOR_VERIFIED: { text: 'Vendor verified', tone: 'good' }, VENDOR_BLOCKED: { text: 'Vendor blocked', tone: 'bad' }, VENDOR_PAYEE_VIEWED: { text: 'Payee email viewed for verification' },
  MANDATE_CREATED: { text: 'Mandate drafted' }, MANDATE_ACTIVATED: { text: 'Mandate activated', tone: 'good' }, MANDATE_SUSPENDED: { text: 'Mandate suspended', tone: 'bad' },
  AGENT_CREATED: { text: 'Agent key issued' }, AGENT_REVOKED: { text: 'Agent key revoked', tone: 'bad' }, WEBHOOK_REJECTED: { text: 'Forged webhook rejected', tone: 'bad' }, DEMO_SEEDED: { text: 'Demo data loaded' }, DEMO_RESET: { text: 'Demo data reset', tone: 'warn' },
};
export const actionText = (a: string): string => ACTIONS[a]?.text ?? a.toLowerCase().replace(/_/g, ' ');
export const actionTone = (a: string): Tone => ACTIONS[a]?.tone ?? 'info';

/** $1.3k / $2.5M: for chart axes and tight spaces. */
export function compactMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100);
}

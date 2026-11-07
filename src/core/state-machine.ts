import type { InvoiceStatus, PaymentStatus } from './types';

export class IllegalTransition extends Error {}

const INVOICE: Record<InvoiceStatus, InvoiceStatus[]> = {
  NEEDS_REVIEW: ['REJECTED'],
  AWAITING_APPROVAL: ['PAYMENT_PENDING', 'REJECTED', 'CANCELED'],
  PAYMENT_PENDING: ['PAID', 'PAYMENT_FAILED', 'CANCELED'],
  PAID: [],
  PAYMENT_FAILED: [],
  REJECTED: [],
  CANCELED: [],
};

export function assertInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!INVOICE[from].includes(to)) throw new IllegalTransition(`Invoice cannot move ${from} → ${to}`);
}

/**
 * Payment states only move forward. Webhooks can arrive late or out of order,
 * so a transition is applied only if it is legal; otherwise the event is ignored.
 */
const PAYMENT: Record<PaymentStatus, PaymentStatus[]> = {
  QUEUED: ['SUBMITTING', 'CANCELED'],
  SUBMITTING: ['SUBMITTED', 'UNKNOWN', 'FAILED', 'QUEUED'], // QUEUED = claim released (e.g. kill switch)
  UNKNOWN: ['SUBMITTING', 'SUBMITTED', 'PAID', 'FAILED', 'BLOCKED', 'RETURNED'],
  SUBMITTED: ['PAID', 'FAILED', 'BLOCKED', 'RETURNED'],
  PAID: [],
  FAILED: [],
  BLOCKED: [],
  RETURNED: [],
  CANCELED: [],
};

export const canMovePayment = (from: PaymentStatus, to: PaymentStatus): boolean => from === to || PAYMENT[from].includes(to);

export const PAYMENT_TERMINAL: PaymentStatus[] = ['PAID', 'FAILED', 'BLOCKED', 'RETURNED', 'CANCELED'];
/** Payments that still count against the budget. Released when they fail, are blocked, returned or canceled. */
export const BUDGET_CONSUMING: PaymentStatus[] = ['QUEUED', 'SUBMITTING', 'UNKNOWN', 'SUBMITTED', 'PAID'];

/** PayPal's payout-item transaction_status → our payment status (null = no change). */
export function fromPayPalItemStatus(s: string): PaymentStatus | null {
  switch (s.toUpperCase()) {
    case 'SUCCESS': return 'PAID';
    case 'FAILED': case 'DENIED': return 'FAILED';
    case 'BLOCKED': return 'BLOCKED';
    case 'RETURNED': case 'REFUNDED': case 'REVERSED': return 'RETURNED';
    case 'PENDING': case 'ONHOLD': case 'UNCLAIMED': return 'SUBMITTED';
    default: return null;
  }
}

export function paymentToInvoiceStatus(p: PaymentStatus): InvoiceStatus | null {
  if (p === 'PAID') return 'PAID';
  if (p === 'FAILED' || p === 'BLOCKED' || p === 'RETURNED') return 'PAYMENT_FAILED';
  if (p === 'CANCELED') return 'CANCELED';
  return null;
}

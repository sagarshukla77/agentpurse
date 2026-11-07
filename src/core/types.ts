export type Role = 'owner' | 'approver' | 'viewer';
export type Verdict = 'ALLOW' | 'ESCALATE' | 'DENY';

export type MandateStatus = 'pending_activation' | 'active' | 'suspended';
export interface Mandate {
  id: string;
  name: string;
  status: MandateStatus;
  currency: string;
  budgetCents: number;
  perPaymentCapCents: number;
  approvalThresholdCents: number;
  velocityMaxPerHour: number;
  expiresAt: Date;
  vendorIds: string[];
}

export type VendorStatus = 'pending' | 'verified' | 'blocked';
export interface VendorFacts {
  status: VendorStatus | 'unknown';
  allowlisted: boolean;
  priorPaidCount: number;
}

export type RiskFlag =
  | 'DUPLICATE'
  | 'PROMPT_INJECTION'
  | 'PAYEE_MISMATCH'
  | 'ANOMALOUS_AMOUNT'
  | 'MATH_MISMATCH'
  | 'LOW_CONFIDENCE';

/** What is being asked for. Built only from validated, structured data. */
export interface Proposal {
  amountCents: number;
  currency: string;
  vendorId: string | null;
  riskFlags: RiskFlag[];
}

/** The state of the world at decision time. */
export interface PolicyContext {
  now: Date;
  killSwitch: boolean;
  vendor: VendorFacts;
  spentThisPeriodCents: number;
  paymentsLastHour: number;
  /** True when a human has approved this exact proposal. Lifts escalations, never denials. */
  approved: boolean;
}

export type ReasonCode =
  | 'KILL_SWITCH' | 'MANDATE_INACTIVE' | 'MANDATE_EXPIRED' | 'CURRENCY_MISMATCH' | 'AMOUNT_INVALID'
  | 'VENDOR_UNKNOWN' | 'VENDOR_UNVERIFIED' | 'VENDOR_NOT_ALLOWLISTED' | 'PROMPT_INJECTION' | 'DUPLICATE'
  | 'OVER_PER_PAYMENT_CAP' | 'BUDGET_EXHAUSTED' | 'FIRST_PAYMENT' | 'OVER_APPROVAL_THRESHOLD'
  | 'VELOCITY' | 'ANOMALOUS_AMOUNT' | 'PAYEE_MISMATCH' | 'MATH_MISMATCH' | 'LOW_CONFIDENCE';

export interface RuleResult {
  code: ReasonCode;
  outcome: 'pass' | 'deny' | 'escalate';
  detail: string;
}

export interface Decision {
  verdict: Verdict;
  reasons: RuleResult[]; // only the failing rules
  trace: RuleResult[]; // every rule, in order
  policyVersion: string;
}

export interface ExtractedInvoice {
  vendorName: string;
  vendorEmail: string | null;
  invoiceNumber: string | null;
  amountCents: number;
  currency: string;
  dueDate: string | null;
  lineItems: { description: string; amountCents: number }[];
  confidence: number;
}

export type InvoiceStatus =
  | 'NEEDS_REVIEW' | 'REJECTED' | 'AWAITING_APPROVAL' | 'PAYMENT_PENDING'
  | 'PAID' | 'PAYMENT_FAILED' | 'CANCELED';

export type PaymentStatus =
  | 'QUEUED' | 'SUBMITTING' | 'UNKNOWN' | 'SUBMITTED'
  | 'PAID' | 'FAILED' | 'BLOCKED' | 'RETURNED' | 'CANCELED';

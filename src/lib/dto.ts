/** Shapes returned by the API. Client-safe: no server imports. */
import type { InvoiceStatus, PaymentStatus, RuleResult, Verdict } from '@/core/types';

export interface Me { id: string; email: string; name: string; role: 'owner' | 'approver' | 'viewer' }
export interface Auditable { id: string; ts: string; action: string; actorKind: string; subjectType: string | null; subjectId: string | null }
export interface AuditEvent extends Auditable { seq: number; actorId: string | null; detail: Record<string, unknown>; hash: string; prevHash: string }

export interface MandateSummary {
  id: string; name: string; status: 'pending_activation' | 'active' | 'suspended'; currency: string; budgetCents: number;
  perPaymentCapCents: number; approvalThresholdCents: number; expiresAt: string; paidCents: number; inFlightCents: number;
}
export interface DashboardData {
  mandates: MandateSummary[]; invoiceCounts: Record<string, number>; pendingApprovals: number;
  killSwitch: { engaged: boolean; by: string | null; at: string | null; reason: string | null };
  recent: Auditable[]; paypalMode: 'sandbox' | 'simulated'; aiMode: 'mock' | 'anthropic' | 'gemini'; demoMode: boolean; holdSeconds: number;
}

export interface InvoiceRow {
  id: string; createdAt: string; status: InvoiceStatus; source: string; vendorName: string | null; invoiceNumber: string | null;
  amountCents: number | null; currency: string | null; submittedByKind: string; verdict: Verdict | null; paymentStatus: PaymentStatus | null;
}

export interface InvoiceDetail {
  invoice: {
    id: string; createdAt: string; status: InvoiceStatus; source: string; vendorName: string | null; vendorRegistryName: string | null;
    invoiceNumber: string | null; amountCents: number | null; currency: string | null; dueDate: string | null; submittedByKind: string;
    extracted: { vendorName: string; vendorEmail: string | null; invoiceNumber: string | null; amountCents: number; currency: string; dueDate: string | null; lineItems: { description: string; amountCents: number }[]; confidence: number } | null;
  };
  decision: { verdict: Verdict; reasons: RuleResult[]; trace: RuleResult[]; explanation: string | null; policyVersion: string } | null;
  payment: { id: string; status: PaymentStatus; amountCents: number; currency: string; releaseAt: string; attempts: number; paypalBatchId: string | null; lastError: string | null } | null;
  approval: { id: string; status: 'pending' | 'approved' | 'rejected'; note: string | null } | null;
  events: AuditEvent[];
  source: { kind: 'text'; text: string } | { kind: 'file'; mime: string; dataUrl: string | null } | null;
}

export interface PendingApproval {
  approvalId: string; createdAt: string; invoiceId: string; vendorName: string | null; invoiceNumber: string | null;
  amountCents: number; currency: string; submittedByKind: string; reasons: RuleResult[]; explanation: string | null;
}
export interface ApprovalView {
  token: string; needsStepUp: boolean; makerChecker: boolean; invoiceId: string; vendorName: string | null; payeeEmailMasked: string | null;
  amountCents: number; currency: string; invoiceNumber: string | null; reasons: RuleResult[]; trace: RuleResult[]; explanation: string | null;
}

export interface VendorRow { id: string; name: string; status: 'pending' | 'verified' | 'blocked'; createdAt: string; verifiedAt: string | null; verificationNote: string | null; createdByName: string | null; verifiedByName: string | null; paidCount: number }
export interface MandateRow extends MandateSummary { velocityMaxPerHour: number; vendorIds: string[] }
export interface AgentRow { id: string; name: string; keyPrefix: string; mandateId: string; status: 'active' | 'revoked'; createdAt: string; lastUsedAt: string | null }
export interface FixtureItem { file: string; title: string; expect: Verdict; codes: string[] }
export interface ReplayResponse { rows: { id: string; before: Verdict; after: Verdict; changed: boolean }[]; counts: Record<Verdict, number>; changed: number }
export interface IngestResponse { invoiceId: string; status: string; verdict: Verdict | 'NEEDS_REVIEW'; reasons: { code: string; detail: string }[]; approvalId?: string; explanation?: string }

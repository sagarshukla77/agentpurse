import type { ExtractedInvoice, RiskFlag } from '../types';
import { normalizeEmail } from '../vendors';
import type { InjectionResult } from './injection';

export interface HistoryInvoice {
  contentHash: string;
  vendorId: string | null;
  invoiceNumber: string | null;
  amountCents: number;
  createdAt: Date;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function isDuplicate(
  cur: { contentHash: string; vendorId: string | null; invoiceNumber: string | null; amountCents: number },
  history: HistoryInvoice[],
  now: Date,
): boolean {
  return history.some((h) =>
    h.contentHash === cur.contentHash ||
    (cur.vendorId !== null && h.vendorId === cur.vendorId && cur.invoiceNumber !== null && h.invoiceNumber === cur.invoiceNumber) ||
    (cur.vendorId !== null && h.vendorId === cur.vendorId && h.amountCents === cur.amountCents &&
      now.getTime() - h.createdAt.getTime() < WEEK_MS && cur.invoiceNumber === null),
  );
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Flags an invoice far above what this vendor normally charges. Needs enough history to mean anything. */
export function isAnomalous(amountCents: number, paidHistoryCents: number[], multiple = 3, minSamples = 3): boolean {
  if (paidHistoryCents.length < minSamples) return false;
  return amountCents > median(paidHistoryCents) * multiple;
}

export function linesMismatch(x: ExtractedInvoice): boolean {
  if (!x.lineItems.length) return false;
  return x.lineItems.reduce((s, l) => s + l.amountCents, 0) !== x.amountCents;
}

export function payeeMismatch(extractedEmail: string | null, registryEmail: string | null): boolean {
  if (!extractedEmail || !registryEmail) return false;
  return normalizeEmail(extractedEmail) !== normalizeEmail(registryEmail);
}

export interface RiskInput {
  extracted: ExtractedInvoice;
  contentHash: string;
  vendorId: string | null;
  registryEmail: string | null;
  injection: InjectionResult;
  history: HistoryInvoice[];
  paidHistoryCents: number[];
  now: Date;
}

export function assessRisk(i: RiskInput): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (i.injection.flagged) flags.push('PROMPT_INJECTION');
  if (isDuplicate({ contentHash: i.contentHash, vendorId: i.vendorId, invoiceNumber: i.extracted.invoiceNumber, amountCents: i.extracted.amountCents }, i.history, i.now)) flags.push('DUPLICATE');
  if (payeeMismatch(i.extracted.vendorEmail, i.registryEmail)) flags.push('PAYEE_MISMATCH');
  if (isAnomalous(i.extracted.amountCents, i.paidHistoryCents)) flags.push('ANOMALOUS_AMOUNT');
  if (linesMismatch(i.extracted)) flags.push('MATH_MISMATCH');
  if (i.extracted.confidence < 0.7) flags.push('LOW_CONFIDENCE');
  return flags;
}

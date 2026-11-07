import type { Decision, Mandate, PolicyContext, Proposal, ReasonCode, RuleResult } from '../types';
import { formatMoney } from '../money';

export const POLICY_VERSION = '1.0.0';

/**
 * The policy engine is the ONLY component allowed to authorise money movement.
 * It is a pure function: same inputs, same decision. It never sees raw invoice text,
 * only validated structured fields and risk flags, so prompt injection cannot reach it.
 *
 * Every rule is evaluated (no early return) so the UI can show each gate.
 * Any DENY beats any ESCALATE; ESCALATE beats ALLOW.
 */
export function evaluate(p: Proposal, m: Mandate, c: PolicyContext): Decision {
  const trace: RuleResult[] = [];
  const add = (code: ReasonCode, outcome: RuleResult['outcome'], detail: string) =>
    trace.push({ code, outcome, detail });
  const hasFlag = (f: Proposal['riskFlags'][number]) => p.riskFlags.includes(f);
  const money = (n: number) => formatMoney(n, m.currency);

  // ---- Hard denials: a human approval can never lift these ----
  if (c.killSwitch) add('KILL_SWITCH', 'deny', 'Kill switch is engaged; all payments are frozen');
  else add('KILL_SWITCH', 'pass', 'Kill switch is off');

  if (m.status !== 'active') add('MANDATE_INACTIVE', 'deny', 'Mandate is not active');
  else add('MANDATE_INACTIVE', 'pass', 'Mandate is active');

  if (m.expiresAt.getTime() <= c.now.getTime()) add('MANDATE_EXPIRED', 'deny', 'Mandate has expired');
  else add('MANDATE_EXPIRED', 'pass', 'Mandate has not expired');

  if (p.currency !== m.currency) add('CURRENCY_MISMATCH', 'deny', `Invoice is in ${p.currency}; this mandate only allows ${m.currency}`);
  else add('CURRENCY_MISMATCH', 'pass', `Currency is ${m.currency}`);

  if (!Number.isSafeInteger(p.amountCents) || p.amountCents <= 0) add('AMOUNT_INVALID', 'deny', 'Amount must be a positive number');
  else add('AMOUNT_INVALID', 'pass', 'Amount is valid');

  if (c.vendor.status === 'unknown' || p.vendorId === null) {
    add('VENDOR_UNKNOWN', 'deny', 'Vendor is not in the registry. Add and verify the vendor first');
  } else if (c.vendor.status !== 'verified') {
    add('VENDOR_UNVERIFIED', 'deny', `Vendor status is "${c.vendor.status}"; only verified vendors can be paid`);
  } else {
    add('VENDOR_UNKNOWN', 'pass', 'Vendor is in the registry and verified');
  }

  if (c.vendor.status === 'verified' && !c.vendor.allowlisted) add('VENDOR_NOT_ALLOWLISTED', 'deny', 'Vendor is not on this mandate’s allowlist');
  else add('VENDOR_NOT_ALLOWLISTED', 'pass', 'Vendor is allowed under this mandate');

  if (hasFlag('PROMPT_INJECTION')) add('PROMPT_INJECTION', 'deny', 'Document contains instructions aimed at the AI; blocked');
  else add('PROMPT_INJECTION', 'pass', 'No embedded instructions detected');

  if (hasFlag('DUPLICATE')) add('DUPLICATE', 'deny', 'Looks like an invoice we have already seen');
  else add('DUPLICATE', 'pass', 'Not a duplicate');

  if (p.amountCents > m.perPaymentCapCents) add('OVER_PER_PAYMENT_CAP', 'deny', `${money(p.amountCents)} exceeds the per-payment cap of ${money(m.perPaymentCapCents)}`);
  else add('OVER_PER_PAYMENT_CAP', 'pass', `Within the per-payment cap of ${money(m.perPaymentCapCents)}`);

  const projected = c.spentThisPeriodCents + p.amountCents;
  if (projected > m.budgetCents) add('BUDGET_EXHAUSTED', 'deny', `Would bring spend to ${money(projected)}, over the budget of ${money(m.budgetCents)}`);
  else add('BUDGET_EXHAUSTED', 'pass', `${money(m.budgetCents - projected)} of budget would remain`);

  // ---- Escalations: a human approval can lift these ----
  const esc = (code: ReasonCode, hit: boolean, hitMsg: string, okMsg: string) => {
    if (!hit) add(code, 'pass', okMsg);
    else if (c.approved) add(code, 'pass', `${hitMsg} (approved by a human)`);
    else add(code, 'escalate', hitMsg);
  };

  esc('FIRST_PAYMENT', c.vendor.status === 'verified' && c.vendor.priorPaidCount === 0,
    'First payment to this vendor needs human approval', 'Vendor has been paid before');
  esc('OVER_APPROVAL_THRESHOLD', p.amountCents > m.approvalThresholdCents,
    `${money(p.amountCents)} is above the auto-approve limit of ${money(m.approvalThresholdCents)}`,
    `Within the auto-approve limit of ${money(m.approvalThresholdCents)}`);
  esc('VELOCITY', c.paymentsLastHour >= m.velocityMaxPerHour,
    `${c.paymentsLastHour} payments in the last hour (limit ${m.velocityMaxPerHour})`, 'Payment rate is normal');
  esc('ANOMALOUS_AMOUNT', hasFlag('ANOMALOUS_AMOUNT'),
    'Amount is far above this vendor’s usual invoices', 'Amount is typical for this vendor');
  esc('PAYEE_MISMATCH', hasFlag('PAYEE_MISMATCH'),
    'Payee email on the invoice differs from the verified vendor record', 'Payee matches the verified record');
  esc('MATH_MISMATCH', hasFlag('MATH_MISMATCH'), 'Line items do not add up to the total', 'Line items add up');
  esc('LOW_CONFIDENCE', hasFlag('LOW_CONFIDENCE'), 'The AI was not confident reading this document', 'Extraction confidence is high');

  const reasons = trace.filter((r) => r.outcome !== 'pass');
  const verdict = reasons.some((r) => r.outcome === 'deny') ? 'DENY' : reasons.length ? 'ESCALATE' : 'ALLOW';
  return { verdict, reasons, trace, policyVersion: POLICY_VERSION };
}

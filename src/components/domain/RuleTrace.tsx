'use client';
import { useState } from 'react';
import type { RuleResult } from '@/core/types';
import { Button } from '../ui';

const LABEL: Record<string, string> = {
  KILL_SWITCH: 'Kill switch', MANDATE_INACTIVE: 'Mandate status', MANDATE_EXPIRED: 'Mandate expiry', CURRENCY_MISMATCH: 'Currency',
  AMOUNT_INVALID: 'Amount', VENDOR_UNKNOWN: 'Vendor registry', VENDOR_UNVERIFIED: 'Vendor verification', VENDOR_NOT_ALLOWLISTED: 'Vendor allowlist',
  PROMPT_INJECTION: 'Embedded instructions', DUPLICATE: 'Duplicate check', OVER_PER_PAYMENT_CAP: 'Per-payment cap', BUDGET_EXHAUSTED: 'Budget',
  FIRST_PAYMENT: 'Vendor payment history', OVER_APPROVAL_THRESHOLD: 'Auto-approve limit', VELOCITY: 'Payment rate', ANOMALOUS_AMOUNT: 'Amount vs history',
  PAYEE_MISMATCH: 'Payee', MATH_MISMATCH: 'Line items', LOW_CONFIDENCE: 'AI confidence',
};

/** Every gate the payment had to pass, in order. Failures first; passes tucked away but one click from view. */
export function RuleTrace({ trace }: { trace: RuleResult[] }) {
  const [showAll, setShowAll] = useState(false);
  const failed = trace.filter((r) => r.outcome !== 'pass');
  const passed = trace.filter((r) => r.outcome === 'pass');
  const rows = showAll || failed.length === 0 ? trace : failed;
  return (
    <div className="stack-sm">
      <div className="trace" role="list">
        {rows.map((r, i) => (
          <div key={`${r.code}-${i}`} className={`trace-item ${r.outcome}`} role="listitem">
            <span className={`dot ${r.outcome}`} aria-hidden>{r.outcome === 'pass' ? '✓' : r.outcome === 'deny' ? '✕' : '!'}</span>
            <div><b>{LABEL[r.code] ?? r.code}</b><p>{r.detail}</p></div>
          </div>
        ))}
      </div>
      {failed.length > 0 && passed.length > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Hide passed checks' : `Show ${passed.length} passed checks`}</Button>
      )}
    </div>
  );
}

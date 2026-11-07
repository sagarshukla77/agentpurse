import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mockExtract } from '../src/ai/mock-extractor';
import { detectInjection } from '../src/core/risk/injection';
import { underwrite } from '../src/core/underwrite';
import { sha256 } from '../src/core/security/crypto';
import { matchVendor } from '../src/core/vendors';
import type { HistoryInvoice } from '../src/core/risk/checks';
import type { Mandate } from '../src/core/types';
import { MANDATE, VENDORS, defaultVendorEmail, renderFixture } from '../fixtures/world';

/**
 * Runs all 12 demo invoices through the real extraction → risk → policy path against the
 * same world the seed script builds, in order, with running history and spend.
 * This is the table that goes in the README.
 */
const NOW = new Date('2026-11-05T12:00:00Z');
const manifest = JSON.parse(readFileSync(join(__dirname, '../fixtures/manifest.json'), 'utf8')) as
  { file: string; title: string; expect: string; codes: string[] }[];

const registry = VENDORS.map((v) => ({ id: v.key, name: v.name, status: v.status, allowlisted: v.allowlisted, payeeEmail: defaultVendorEmail(v.key), paid: [...v.paidHistoryCents] }));
const mandate: Mandate = { id: 'm', ...MANDATE, status: 'active', expiresAt: new Date('2026-12-01'), vendorIds: registry.filter((v) => v.allowlisted).map((v) => v.id) };

test('every fixture produces the verdict and reasons the README promises', () => {
  const history: HistoryInvoice[] = [];
  let spent = registry.reduce((s, v) => s + v.paid.reduce((a, b) => a + b, 0), 0) * 0; // seeded history is last period
  const rows: string[] = [];

  for (const f of manifest) {
    const text = renderFixture(readFileSync(join(__dirname, '../fixtures/invoices', f.file), 'utf8'));
    const extracted = mockExtract(text);
    const v = matchVendor(extracted.vendorName, registry);
    const { decision, proposal } = underwrite({
      extracted, contentHash: sha256(text),
      vendor: v ? { id: v.id, payeeEmail: v.payeeEmail } : null,
      vendorFacts: v ? { status: v.status, allowlisted: v.allowlisted, priorPaidCount: v.paid.length } : { status: 'unknown', allowlisted: false, priorPaidCount: 0 },
      injection: detectInjection(text), history, paidHistoryCents: v?.paid ?? [],
      mandate, killSwitch: false, spentThisPeriodCents: spent, paymentsLastHour: 0, now: NOW,
    });

    assert.equal(decision.verdict, f.expect, `${f.file}: expected ${f.expect}, got ${decision.verdict} (${decision.reasons.map((r) => r.code)})`);
    for (const code of f.codes) assert.ok(decision.reasons.some((r) => r.code === code), `${f.file}: missing reason ${code}`);
    rows.push(`| ${f.file.padEnd(32)} | ${decision.verdict.padEnd(8)} | ${decision.reasons.map((r) => r.code).join(', ') || '-'} |`);

    // Only live invoices count as history (denied ones do not block a corrected resubmission).
    if (decision.verdict !== 'DENY') {
      history.push({ contentHash: sha256(text), vendorId: proposal.vendorId, invoiceNumber: extracted.invoiceNumber, amountCents: extracted.amountCents, createdAt: NOW });
    }
    if (decision.verdict === 'ALLOW') spent += extracted.amountCents;
  }
  console.log('\n| fixture                          | verdict  | reasons |\n|---|---|---|\n' + rows.join('\n'));
});

test('the injection fixture is blocked even though its amount is well within limits', () => {
  const text = renderFixture(readFileSync(join(__dirname, '../fixtures/invoices/07-injection-attack.txt'), 'utf8'));
  const x = mockExtract(text);
  assert.equal(x.amountCents, 30_000, 'the model-visible amount is the legitimate one');
  assert.ok(detectInjection(text).flagged);
});

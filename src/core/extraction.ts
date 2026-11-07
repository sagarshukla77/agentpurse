import type { ExtractedInvoice } from './types';
import { toCents, normalizeCurrency } from './money';
import { asArray, asNumber, asObject, asOptString, asString, ValidationError } from './validate';

/**
 * Validates the raw JSON an LLM (or the offline parser) produced. LLM output is
 * untrusted: anything that does not fit the schema is rejected, never "fixed up".
 */
export function parseExtraction(raw: unknown): ExtractedInvoice {
  const o = asObject(raw, 'extraction');
  const currency = normalizeCurrency(asString(o.currency, 'currency', 3, 3));
  if (!/^[A-Z]{3}$/.test(currency)) throw new ValidationError('currency', 'must be an ISO 4217 code');

  const amount = (x: unknown, path: string): number => {
    if (typeof x !== 'string' && typeof x !== 'number') throw new ValidationError(path, 'must be a number or numeric string');
    return toCents(x);
  };

  const items = asArray(o.lineItems ?? [], 'lineItems', 100).map((li, i) => {
    const it = asObject(li, `lineItems[${i}]`);
    return {
      description: asString(it.description, `lineItems[${i}].description`, 300),
      amountCents: amount(it.amount, `lineItems[${i}].amount`),
    };
  });

  const dueDate = asOptString(o.dueDate, 'dueDate', 10);
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new ValidationError('dueDate', 'must be YYYY-MM-DD');

  return {
    vendorName: asString(o.vendorName, 'vendorName', 200),
    vendorEmail: asOptString(o.vendorEmail, 'vendorEmail', 254)?.toLowerCase() ?? null,
    invoiceNumber: asOptString(o.invoiceNumber, 'invoiceNumber', 100),
    amountCents: amount(o.totalAmount, 'totalAmount'),
    currency,
    dueDate,
    lineItems: items,
    confidence: asNumber(o.confidence, 'confidence', 0, 1),
  };
}

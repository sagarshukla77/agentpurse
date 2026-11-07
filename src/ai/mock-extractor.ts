import type { ExtractedInvoice } from '@/core/types';
import { parseExtraction } from '@/core/extraction';
import { ValidationError } from '@/core/validate';

/**
 * Offline, deterministic extractor for the "Key: value" invoice format used by the fixtures.
 * Lets the whole pipeline run (tests, demos without an API key) with AI_MODE=mock.
 * It goes through the SAME schema validation as real LLM output.
 */
export function mockExtract(text: string): ExtractedInvoice {
  const get = (re: RegExp): string | undefined => text.match(re)?.[1]?.trim();
  const vendorName = get(/^\s*vendor\s*:\s*(.+)$/im);
  const total = get(/^\s*total\s*:\s*([\d.,]+)/im);
  if (!vendorName || !total) throw new ValidationError('document', 'could not find a vendor and total');

  const lineItems = [...text.matchAll(/^\s*item\s*:\s*(.+?)\s*\|\s*([\d.,]+)\s*$/gim)]
    .map((m) => ({ description: m[1], amount: m[2] }));

  return parseExtraction({
    vendorName,
    vendorEmail: get(/^\s*vendor email\s*:\s*(\S+)/im) ?? null,
    invoiceNumber: get(/^\s*invoice\s*#?\s*:\s*(.+)$/im) ?? null,
    totalAmount: total,
    currency: get(/^\s*currency\s*:\s*([A-Za-z]{3})/im) ?? 'USD',
    dueDate: get(/^\s*due\s*:\s*(\d{4}-\d{2}-\d{2})/im) ?? null,
    lineItems,
    confidence: 0.95,
  });
}

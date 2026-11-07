import type { ExtractedInvoice } from '@/core/types';
import { parseExtraction } from '@/core/extraction';
import type { InjectionResult } from '@/core/risk/injection';
import { env } from '@/server/env';
import { callModel, parseJsonReply, type Part } from './llm';
import { mockExtract } from './mock-extractor';
import { EXTRACT_SYSTEM } from './prompts';

export interface ExtractInput { text?: string; file?: { mime: string; base64: string } }
export interface Extraction { invoice: ExtractedInvoice; injection: InjectionResult }

/** Reads the model's own "did this document try to instruct me?" flag. Missing or malformed counts as "no flag". */
function readInjection(raw: unknown): InjectionResult {
  const s = (raw as { suspectedInstructions?: { found?: unknown; evidence?: unknown } } | null)?.suspectedInstructions;
  if (s?.found !== true) return { flagged: false, evidence: [] };
  const evidence = Array.isArray(s.evidence) ? s.evidence.filter((e): e is string => typeof e === 'string').slice(0, 3) : [];
  return { flagged: true, evidence: evidence.length ? evidence : ['the AI flagged embedded instructions'] };
}

/**
 * Extraction has NO tools and NO authority. Its output is untrusted until it passes schema validation, and even
 * then it only produces a *proposal*; the policy engine decides. One call both reads the invoice and flags any
 * instructions hidden in it (which also keeps us inside free-tier rate limits).
 */
export async function extractInvoice(input: ExtractInput, opts: { skipBudget?: boolean } = {}): Promise<Extraction> {
  if (env().ai.mode === 'mock') {
    if (!input.text) throw new Error('Mock AI mode only reads pasted text. Set AI_MODE=gemini or anthropic for files');
    return { invoice: mockExtract(input.text), injection: { flagged: false, evidence: [] } };
  }
  const parts: Part[] = [];
  if (input.file) parts.push({ data: input.file.base64, mime: input.file.mime });
  if (input.text) parts.push({ text: `<invoice_document>\n${input.text}\n</invoice_document>` });
  parts.push({ text: 'Extract the invoice as specified. Reply with JSON only.' });

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await callModel({
      tier: 'extract', system: EXTRACT_SYSTEM, skipBudget: opts.skipBudget,
      parts: attempt === 0 ? parts : [...parts, { text: `Your previous reply was invalid (${lastError}). Reply with valid JSON only.` }],
    });
    try {
      const raw = parseJsonReply(reply);
      return { invoice: parseExtraction(raw), injection: readInjection(raw) };
    } catch (e) { lastError = e instanceof Error ? e.message : 'invalid'; }
  }
  throw new Error(`Could not read this document reliably: ${lastError}`);
}

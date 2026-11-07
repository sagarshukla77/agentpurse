import type { Decision } from '@/core/types';
import { env } from '@/server/env';
import { callModel } from './llm';
import { EXPLAIN_SYSTEM } from './prompts';

/** Deterministic wording, also the fallback if the model is unavailable. */
export function templateExplanation(d: Decision): string {
  if (d.verdict === 'ALLOW') return 'Every rule passed, so this payment is queued. You can still cancel it during the hold window.';
  const why = d.reasons.map((r) => r.detail).join('; ');
  return d.verdict === 'ESCALATE' ? `Needs your approval before any money moves: ${why}.` : `Blocked: ${why}.`;
}

/** Describes a decision. It can never change one. */
export async function explainDecision(d: Decision): Promise<string> {
  if (env().ai.mode === 'mock' || !env().ai.llmExplain) return templateExplanation(d); // deterministic wording unless AI_EXPLAIN=true
  try {
    const text = await callModel({
      tier: 'fast', system: EXPLAIN_SYSTEM, maxTokens: 400,
      parts: [{ text: JSON.stringify({ verdict: d.verdict, reasons: d.reasons.map((r) => ({ code: r.code, detail: r.detail })) }) }],
    });
    return text.trim() || templateExplanation(d);
  } catch { return templateExplanation(d); }
}

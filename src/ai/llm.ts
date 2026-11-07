import { pool } from '@/server/db';
import { env } from '@/server/env';
import { bumpAiCalls } from '@/server/repos/flags';
import { ClaudeRetryable, claudeRequest } from './anthropic';
import { GeminiRetryable, geminiRequest } from './gemini';
import type { Part } from './gemini-protocol';

export type { Part };
export class AiBudgetExceeded extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCallAt = 0;

/** Spaces calls out so a burst (like "Run all" in the Playground) stays under the provider's per-minute limit. */
async function throttle(): Promise<void> {
  const gap = Math.ceil(60_000 / Math.max(1, env().ai.maxRpm));
  const wait = Math.max(0, lastCallAt + gap - Date.now());
  lastCallAt = Date.now() + wait; // reserve the slot before sleeping so concurrent callers queue up
  if (wait > 0) await sleep(wait);
}

/** Pulls the first JSON object out of a model reply, tolerating code fences. */
export function parseJsonReply(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON in model reply');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * The only way the app talks to an AI model. Whichever provider is configured (Claude or the free Gemini
 * tier), the same rules apply: a daily call cap, throttling, bounded retries, and no tools. Output is untrusted.
 */
export async function callModel(opts: { tier: 'extract' | 'fast'; system: string; parts: Part[]; maxTokens?: number; skipBudget?: boolean }): Promise<string> {
  const { mode, extractModel, fastModel, maxCallsPerDay } = env().ai;
  if (mode === 'mock') throw new Error('AI_MODE is "mock": no model is configured');
  const model = opts.tier === 'extract' ? extractModel : fastModel;
  const maxTokens = opts.maxTokens ?? 4096; // generous: some Gemini models spend output tokens "thinking"

  if (!opts.skipBudget) {
    const calls = await bumpAiCalls(pool(), new Date().toISOString().slice(0, 10));
    if (calls > maxCallsPerDay) throw new AiBudgetExceeded('Daily AI call limit reached');
  }

  for (let attempt = 0; ; attempt++) {
    await throttle();
    try {
      return mode === 'gemini' ? await geminiRequest(model, opts.system, opts.parts, maxTokens) : await claudeRequest(model, opts.system, opts.parts, maxTokens);
    } catch (e) {
      const retryable = e instanceof GeminiRetryable || e instanceof ClaudeRetryable;
      if (!retryable || attempt >= 3) {
        if (e instanceof GeminiRetryable) throw new Error(e.dailyLimit ? 'The free Gemini daily quota is used up. Try again tomorrow, or switch model' : `Gemini is rate-limiting requests: ${e.message}`);
        throw e;
      }
      if (e instanceof GeminiRetryable && e.dailyLimit) throw new Error('The free Gemini daily quota is used up. Try again tomorrow, or switch model');
      await sleep(Math.min(60_000, e.retryAfterMs ?? 4000 * 2 ** attempt));
    }
  }
}

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

const log = (m: string) => { if (process.env.AI_VERBOSE === 'true') console.log(`  [ai] ${m}`); };

function explainFailure(e: unknown): Error {
  if (e instanceof GeminiRetryable) {
    if (e.dailyLimit) return new Error('The free Gemini daily quota is used up for the model(s) tried. Try again tomorrow, or add another model to MODEL_FALLBACK');
    if (e.status === 503) return new Error('Gemini is overloaded right now (HTTP 503: "high demand"). This is on Google\'s side and usually passes in minutes. Try again shortly, or add a second model to MODEL_FALLBACK');
    return new Error(`Gemini is rate-limiting requests (HTTP ${e.status}): ${e.message}`);
  }
  if (e instanceof ClaudeRetryable) return new Error('Claude is busy right now. Try again shortly');
  return e instanceof Error ? e : new Error('AI request failed');
}

/**
 * The only way the app talks to an AI model. Whichever provider is configured (Claude or the free Gemini
 * tier), the same rules apply: a daily call cap, throttling, bounded retries, optional fallback models,
 * and no tools. Model output is untrusted.
 */
export async function callModel(opts: { tier: 'extract' | 'fast'; system: string; parts: Part[]; maxTokens?: number; skipBudget?: boolean }): Promise<string> {
  const { mode, extractModel, fastModel, maxCallsPerDay, fallbackModels } = env().ai;
  if (mode === 'mock') throw new Error('AI_MODE is "mock": no model is configured');
  const primary = opts.tier === 'extract' ? extractModel : fastModel;
  const models = [primary, ...fallbackModels.filter((m) => m !== primary)];
  const maxTokens = opts.maxTokens ?? 4096; // generous: some Gemini models spend output tokens "thinking"

  if (!opts.skipBudget) {
    const calls = await bumpAiCalls(pool(), new Date().toISOString().slice(0, 10));
    if (calls > maxCallsPerDay) throw new AiBudgetExceeded('Daily AI call limit reached');
  }

  let lastRetryable: unknown = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await throttle();
      try {
        log(`calling ${model}${attempt ? ` (retry ${attempt})` : ''}`);
        return mode === 'gemini' ? await geminiRequest(model, opts.system, opts.parts, maxTokens) : await claudeRequest(model, opts.system, opts.parts, maxTokens);
      } catch (e) {
        if (!(e instanceof GeminiRetryable || e instanceof ClaudeRetryable)) throw e;
        lastRetryable = e;
        if (e instanceof GeminiRetryable && e.dailyLimit) { log(`${model}: daily quota used up, trying the next model`); break; }
        if (attempt === 3) { log(`${model}: still busy after 4 tries, trying the next model`); break; }
        const wait = Math.min(45_000, e.retryAfterMs ?? 5000 * 2 ** attempt);
        log(`${model} is busy (${e instanceof GeminiRetryable ? e.status : 'busy'}); waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
      }
    }
  }
  throw explainFailure(lastRetryable);
}

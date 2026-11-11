import { env } from '@/server/env';
import { buildGeminiBody, parseGeminiError, parseGeminiReply, type GeminiError, type Part } from './gemini-protocol';

/** Thrown for rate-limit / overload responses so the caller can wait and retry. */
export class GeminiRetryable extends Error {
  constructor(message: string, public retryAfterMs: number | null, public dailyLimit: boolean, public status = 429) { super(message); }
}

export async function geminiRequest(model: string, system: string, parts: Part[], maxTokens: number): Promise<string> {
  const key = env().ai.geminiKey;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  if (!model) throw new Error('Model name is not configured (MODEL_EXTRACT / MODEL_FAST)');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(buildGeminiBody({ system, parts, maxTokens, json: true })),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err: GeminiError = parseGeminiError(body);
    if (res.status === 429 || res.status === 503) throw new GeminiRetryable(err.message, err.retryAfterMs, err.dailyLimit, res.status);
    throw new Error(`Gemini API error ${res.status}: ${err.message}`);
  }
  return parseGeminiReply(body);
}

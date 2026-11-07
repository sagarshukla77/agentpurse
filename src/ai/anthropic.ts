import { env } from '@/server/env';
import type { Part } from './gemini-protocol';

/** Thrown when a rate limit stops us; the caller may wait and retry. */
export class ClaudeRetryable extends Error { constructor(m: string, public retryAfterMs: number | null) { super(m); } }

/** One Messages API call to Claude. No tools are ever attached. */
export async function claudeRequest(model: string, system: string, parts: Part[], maxTokens: number): Promise<string> {
  const { apiKey } = env().ai;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  if (!model) throw new Error('Model name is not configured (MODEL_EXTRACT / MODEL_FAST)');
  const content = parts.map((p) => 'text' in p
    ? { type: 'text', text: p.text }
    : { type: p.mime === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: p.mime, data: p.data } });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 429 || res.status === 529) throw new ClaudeRetryable(`Claude API busy (${res.status})`, Number(res.headers.get('retry-after') ?? 0) * 1000 || null);
  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  const j = (await res.json()) as { content: { type: string; text?: string }[] };
  return j.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
}

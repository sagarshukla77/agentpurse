/** Pure helpers for Google's Gemini REST API: build the request, read the reply, interpret errors. */
export type Part = { text: string } | { data: string; mime: string };

export function buildGeminiBody(opts: { system: string; parts: Part[]; maxTokens: number; json: boolean }) {
  return {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{
      role: 'user',
      parts: opts.parts.map((p) => ('text' in p ? { text: p.text } : { inlineData: { mimeType: p.mime, data: p.data } })),
    }],
    generationConfig: { maxOutputTokens: opts.maxTokens, temperature: 0, ...(opts.json ? { responseMimeType: 'application/json' } : {}) },
  };
}

interface GeminiReply {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** Joins the text parts. Throws a clear error if the model refused or was cut off. */
export function parseGeminiReply(j: GeminiReply): string {
  if (j.promptFeedback?.blockReason) throw new Error(`Gemini blocked this request (${j.promptFeedback.blockReason})`);
  const c = j.candidates?.[0];
  const text = (c?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text) throw new Error(`Gemini returned no text${c?.finishReason ? ` (${c.finishReason})` : ''}`);
  if (c?.finishReason === 'MAX_TOKENS') throw new Error('Gemini reply was cut off (MAX_TOKENS)');
  return text;
}

export interface GeminiError { retryAfterMs: number | null; dailyLimit: boolean; message: string }

/** Pulls "retry in 20s" and "daily quota" out of a Gemini error body. */
export function parseGeminiError(body: unknown): GeminiError {
  const e = (body as { error?: { message?: string; details?: Record<string, unknown>[] } } | null)?.error;
  const details = e?.details ?? [];
  let retryAfterMs: number | null = null;
  let dailyLimit = false;
  for (const d of details) {
    const delay = typeof d.retryDelay === 'string' ? /^([\d.]+)s$/.exec(d.retryDelay) : null;
    if (delay) retryAfterMs = Math.ceil(Number(delay[1]) * 1000);
    const violations = (d.violations as { quotaId?: string }[] | undefined) ?? [];
    if (violations.some((v) => /PerDay/i.test(v.quotaId ?? ''))) dailyLimit = true;
  }
  return { retryAfterMs, dailyLimit, message: e?.message ?? 'Gemini request failed' };
}

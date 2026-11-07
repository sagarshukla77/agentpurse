import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeminiBody, parseGeminiError, parseGeminiReply } from '../src/ai/gemini-protocol';

test('Gemini request carries the system prompt, text, and files', () => {
  const b = buildGeminiBody({ system: 'SYS', maxTokens: 500, json: true, parts: [{ data: 'QUJD', mime: 'application/pdf' }, { text: 'hello' }] });
  assert.equal(b.systemInstruction.parts[0].text, 'SYS');
  assert.deepEqual(b.contents[0].parts[0], { inlineData: { mimeType: 'application/pdf', data: 'QUJD' } });
  assert.deepEqual(b.contents[0].parts[1], { text: 'hello' });
  assert.equal(b.generationConfig.responseMimeType, 'application/json');
  assert.equal(b.generationConfig.temperature, 0);
});

test('Gemini reply: joins text, and refuses blocked or truncated replies', () => {
  assert.equal(parseGeminiReply({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] }, finishReason: 'STOP' }] }), '{"a":1}');
  assert.throws(() => parseGeminiReply({ promptFeedback: { blockReason: 'SAFETY' } }), /blocked/);
  assert.throws(() => parseGeminiReply({ candidates: [] }), /no text/);
  assert.throws(() => parseGeminiReply({ candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }] }), /cut off/);
});

test('Gemini errors: retry delay and daily-quota detection', () => {
  const perMinute = { error: { message: 'quota', details: [{ '@type': 'x.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { '@type': 'x.RetryInfo', retryDelay: '20s' }] } };
  assert.deepEqual(parseGeminiError(perMinute), { retryAfterMs: 20_000, dailyLimit: false, message: 'quota' });
  const perDay = { error: { message: 'daily', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
  assert.equal(parseGeminiError(perDay).dailyLimit, true);
  assert.equal(parseGeminiError(null).message, 'Gemini request failed');
});

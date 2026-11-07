/** Row → API shape helpers. Top-level snake_case → camelCase; *_cents → number; secrets dropped. */
const DROP = new Set(['raw_enc', 'content_hash', 'token_nonce', 'token_used', 'key_hash', 'payee_email_enc', 'payee_email_hash', 'password_hash', 'totp_secret_enc', 'idempotency_key', 'sender_batch_id']);

export function dto<T = Record<string, any>>(row: Record<string, unknown> | null): T {
  if (!row) return null as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (DROP.has(k)) continue;
    const key = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[key] = k.endsWith('_cents') && v !== null ? Number(v) : v instanceof Date ? v.toISOString() : v;
  }
  return out as T;
}
export const dtos = <T = Record<string, any>>(rows: Record<string, unknown>[]): T[] => rows.map((r) => dto<T>(r));

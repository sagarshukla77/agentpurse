import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditBody {
  id: string;
  ts: string; // ISO-8601, millisecond precision
  actorKind: 'user' | 'agent' | 'system' | 'ai' | 'paypal';
  actorId: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  detail: Record<string, unknown>;
}
export interface AuditRecord extends AuditBody { prevHash: string; hash: string }

/** Deterministic JSON: object keys sorted recursively. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export const hashRecord = (prevHash: string, body: AuditBody): string =>
  createHash('sha256').update(prevHash).update('\n').update(canonical(body)).digest('hex');

export interface ChainVerification { ok: boolean; checked: number; brokenAtIndex?: number; reason?: string }

/**
 * Tamper-EVIDENT, not tamper-proof: editing, deleting or reordering any row breaks every
 * later hash. Someone with full database access could recompute the chain, which is why the
 * head hash should also be anchored somewhere the app cannot write (see docs/SECURITY.md).
 */
export function verifyChain(records: AuditRecord[]): ChainVerification {
  let prev = GENESIS_HASH;
  for (let i = 0; i < records.length; i++) {
    const { prevHash, hash, ...body } = records[i];
    if (prevHash !== prev) return { ok: false, checked: i, brokenAtIndex: i, reason: 'previous-hash link is broken (a row was removed, inserted or reordered)' };
    if (hashRecord(prevHash, body) !== hash) return { ok: false, checked: i, brokenAtIndex: i, reason: 'row contents do not match their hash (the row was edited)' };
    prev = hash;
  }
  return { ok: true, checked: records.length };
}

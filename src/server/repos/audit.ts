import { randomUUID } from 'node:crypto';
import { GENESIS_HASH, hashRecord, type AuditBody, type AuditRecord } from '@/core/audit/chain';
import { pool, q, tx, type Db } from '../db';

export interface AuditInput {
  actorKind: AuditBody['actorKind'];
  actorId?: string | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  detail?: Record<string, unknown>;
}

const LOCK_KEY = 7001;

/**
 * Appends one hash-chained event. MUST run inside a transaction: the advisory lock serialises
 * writers so the chain never forks. Never put secrets or raw documents in `detail`.
 */
export async function audit(db: Db, e: AuditInput): Promise<void> {
  await db.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
  const last = await q<{ hash: string }>(db, 'select hash from audit_events order by seq desc limit 1');
  const prevHash = last[0]?.hash ?? GENESIS_HASH;
  const body: AuditBody = {
    id: randomUUID(), ts: new Date().toISOString(), actorKind: e.actorKind, actorId: e.actorId ?? null,
    action: e.action, subjectType: e.subjectType ?? null, subjectId: e.subjectId ?? null, detail: e.detail ?? {},
  };
  await db.query(
    `insert into audit_events (id, ts, actor_kind, actor_id, action, subject_type, subject_id, detail, prev_hash, hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [body.id, body.ts, body.actorKind, body.actorId, body.action, body.subjectType, body.subjectId, JSON.stringify(body.detail), prevHash, hashRecord(prevHash, body)],
  );
}

/** For events that happen outside any business transaction (login, webhook receipt). */
export const auditStandalone = (e: AuditInput) => tx((db) => audit(db, e));

interface Row {
  seq: string; id: string; ts: Date; actor_kind: AuditBody['actorKind']; actor_id: string | null; action: string;
  subject_type: string | null; subject_id: string | null; detail: Record<string, unknown>; prev_hash: string; hash: string;
}
const map = (r: Row): AuditRecord & { seq: number } => ({
  seq: Number(r.seq), id: r.id, ts: r.ts.toISOString(), actorKind: r.actor_kind, actorId: r.actor_id, action: r.action,
  subjectType: r.subject_type, subjectId: r.subject_id, detail: r.detail, prevHash: r.prev_hash, hash: r.hash,
});

export async function listAudit(opts: { limit?: number; subjectId?: string } = {}) {
  const limit = Math.min(opts.limit ?? 200, 1000);
  const rows = opts.subjectId
    ? await q<Row>(pool(), 'select * from audit_events where subject_id=$1 order by seq asc limit $2', [opts.subjectId, limit])
    : await q<Row>(pool(), 'select * from (select * from audit_events order by seq desc limit $1) t order by seq desc', [limit]);
  return rows.map(map);
}

export async function allAuditOrdered(db: Db = pool()): Promise<AuditRecord[]> {
  return (await q<Row>(db, 'select * from audit_events order by seq asc')).map(map);
}

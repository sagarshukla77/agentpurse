import { one, pool, q, type Db } from '../db';

export interface Agent { id: string; name: string; keyPrefix: string; mandateId: string; status: 'active' | 'revoked'; createdAt: Date; lastUsedAt: Date | null }
interface Row { id: string; name: string; key_prefix: string; mandate_id: string; status: Agent['status']; created_at: Date; last_used_at: Date | null }
const map = (r: Row): Agent => ({ id: r.id, name: r.name, keyPrefix: r.key_prefix, mandateId: r.mandate_id, status: r.status, createdAt: r.created_at, lastUsedAt: r.last_used_at });

export const insertAgent = async (db: Db, a: { name: string; keyHash: string; keyPrefix: string; mandateId: string; createdBy: string }) =>
  map((await one<Row>(db, 'insert into agents (name,key_hash,key_prefix,mandate_id,created_by) values ($1,$2,$3,$4,$5) returning *', [a.name, a.keyHash, a.keyPrefix, a.mandateId, a.createdBy]))!);
export const listAgents = async () => (await q<Row>(pool(), 'select * from agents order by created_at desc')).map(map);
export const findAgentByKeyHash = async (hash: string) => { const r = await one<Row>(pool(), `select * from agents where key_hash=$1 and status='active'`, [hash]); return r ? map(r) : null; };
export const touchAgent = (id: string) => pool().query('update agents set last_used_at=now() where id=$1', [id]);
export const revokeAgent = (db: Db, id: string) => db.query(`update agents set status='revoked' where id=$1`, [id]);
export const getAgent = async (db: Db, id: string) => { const r = await one<Row>(db, 'select * from agents where id=$1', [id]); return r ? map(r) : null; };

import type { Role } from '@/core/types';
import { one, pool, q, type Db } from '../db';

export interface User { id: string; email: string; name: string; role: Role; passwordHash: string; totpSecretEnc: string | null }
interface Row { id: string; email: string; name: string; role: Role; password_hash: string; totp_secret_enc: string | null }
const map = (r: Row): User => ({ id: r.id, email: r.email, name: r.name, role: r.role, passwordHash: r.password_hash, totpSecretEnc: r.totp_secret_enc });

export const getUserById = async (id: string, db: Db = pool()) => { const r = await one<Row>(db, 'select * from users where id=$1', [id]); return r ? map(r) : null; };
export const getUserByEmail = async (email: string, db: Db = pool()) => { const r = await one<Row>(db, 'select * from users where email=$1', [email]); return r ? map(r) : null; };
export const listUsers = async (db: Db = pool()) => (await q<Row>(db, 'select * from users order by created_at')).map(map);

export async function insertUser(db: Db, u: { email: string; name: string; role: Role; passwordHash: string; totpSecretEnc: string | null }): Promise<string> {
  const r = await one<{ id: string }>(db,
    `insert into users (email,name,role,password_hash,totp_secret_enc) values ($1,$2,$3,$4,$5)
     on conflict (email) do update set name=excluded.name, role=excluded.role, password_hash=excluded.password_hash, totp_secret_enc=excluded.totp_secret_enc
     returning id`, [u.email, u.name, u.role, u.passwordHash, u.totpSecretEnc]);
  return r!.id;
}

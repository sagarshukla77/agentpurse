import type { VendorStatus } from '@/core/types';
import { decrypt, encrypt, sha256 } from '@/core/security/crypto';
import { maskEmail, normalizeEmail, normalizeName } from '@/core/vendors';
import { env } from '../env';
import { one, pool, q, type Db } from '../db';

export interface Vendor {
  id: string; name: string; status: VendorStatus; payeeEmailMasked: string;
  createdBy: string | null; verifiedBy: string | null; verifiedAt: Date | null; verificationNote: string | null; createdAt: Date;
}
export interface VendorWithPayee extends Vendor { payeeEmail: string }

interface Row {
  id: string; name: string; status: VendorStatus; payee_email_enc: string; created_by: string | null;
  verified_by: string | null; verified_at: Date | null; verification_note: string | null; created_at: Date;
}
const map = (r: Row): VendorWithPayee => {
  const email = decrypt(r.payee_email_enc, env().encryptionKey);
  return { id: r.id, name: r.name, status: r.status, payeeEmail: email, payeeEmailMasked: maskEmail(email), createdBy: r.created_by, verifiedBy: r.verified_by, verifiedAt: r.verified_at, verificationNote: r.verification_note, createdAt: r.created_at };
};

export const listVendors = async (db: Db = pool()) => (await q<Row>(db, 'select * from vendors order by created_at desc')).map(map);
export const getVendor = async (db: Db, id: string) => { const r = await one<Row>(db, 'select * from vendors where id=$1', [id]); return r ? map(r) : null; };

export async function insertVendor(db: Db, v: { name: string; payeeEmail: string; createdBy: string | null; status?: VendorStatus; verifiedBy?: string | null; verificationNote?: string | null }): Promise<string> {
  const email = normalizeEmail(v.payeeEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Vendor payee email is missing or invalid');
  const r = await one<{ id: string }>(db,
    `insert into vendors (name,name_key,payee_email_enc,payee_email_hash,status,created_by,verified_by,verified_at,verification_note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (name_key) do update set payee_email_enc=excluded.payee_email_enc, payee_email_hash=excluded.payee_email_hash, status=excluded.status, verified_by=excluded.verified_by, verified_at=excluded.verified_at, verification_note=excluded.verification_note
     returning id`,
    [v.name, normalizeName(v.name), encrypt(email, env().encryptionKey), sha256(email), v.status ?? 'pending', v.createdBy, v.verifiedBy ?? null, v.status === 'verified' ? new Date() : null, v.verificationNote ?? null]);
  return r!.id;
}

export async function setVendorStatus(db: Db, id: string, status: VendorStatus, by: string, note: string | null): Promise<void> {
  await db.query('update vendors set status=$2, verified_by=$3, verified_at=now(), verification_note=$4 where id=$1', [id, status, by, note]);
}

/** Another vendor already registered to this payee email? (Catches look-alike vendors sharing one account.) */
export const findVendorByEmail = (db: Db, email: string) =>
  one<{ id: string; name: string }>(db, 'select id, name from vendors where payee_email_hash=$1', [sha256(normalizeEmail(email))]);

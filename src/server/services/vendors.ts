import { tx } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { audit } from '../repos/audit';
import { findVendorByEmail, getVendor, insertVendor, setVendorStatus } from '../repos/vendors';
import { normalizeEmail, normalizeName } from '@/core/vendors';
import { one, pool } from '../db';

export async function createVendor(input: { name: string; payeeEmail: string }, userId: string): Promise<string> {
  if (!normalizeName(input.name)) throw badRequest('Vendor name is required');
  return tx(async (db) => {
    const existing = await one<{ id: string }>(db, 'select id from vendors where name_key=$1', [normalizeName(input.name)]);
    if (existing) throw conflict('A vendor with this name already exists');
    // Two "different" vendors sharing one PayPal account is how look-alike-vendor fraud works.
    const sameEmail = await findVendorByEmail(db, input.payeeEmail);
    if (sameEmail) throw conflict(`That PayPal email is already registered to "${sameEmail.name}"`);
    const id = await insertVendor(db, { name: input.name, payeeEmail: input.payeeEmail, createdBy: userId, status: 'pending' });
    await audit(db, { actorKind: 'user', actorId: userId, action: 'VENDOR_CREATED', subjectType: 'vendor', subjectId: id, detail: { name: input.name } });
    return id;
  });
}

/**
 * The verifier sees the real payee email here (the list only ever shows it masked), and the view is audited.
 * A person cannot confirm something out-of-band that they were never shown.
 */
export async function revealPayee(vendorId: string, userId: string) {
  return tx(async (db) => {
    const v = await getVendor(db, vendorId);
    if (!v) throw notFound('Vendor not found');
    await audit(db, { actorKind: 'user', actorId: userId, action: 'VENDOR_PAYEE_VIEWED', subjectType: 'vendor', subjectId: vendorId });
    return { name: v.name, status: v.status, payeeEmail: v.payeeEmail, addedByYou: v.createdBy === userId };
  });
}

/**
 * Maker-checker with teeth:
 *  - the person who added a vendor can never verify it
 *  - the verifier must RE-TYPE the payee email (so they have actually looked at it, not just clicked)
 *  - and must record HOW they confirmed it out-of-band (for example a call-back to a number they already trusted)
 * The system cannot know an email is truthful; this makes a careless or forged verification hard and traceable.
 */
export async function reviewVendor(vendorId: string, action: 'verify' | 'block', note: string, userId: string, confirmEmail?: string): Promise<void> {
  await tx(async (db) => {
    const v = await getVendor(db, vendorId);
    if (!v) throw notFound('Vendor not found');
    if (action === 'verify') {
      if (v.status !== 'pending') throw conflict(`This vendor is already ${v.status}`);
      if (v.createdBy === userId) throw forbidden('You added this vendor, so someone else must verify it');
      if (note.trim().length < 8) throw badRequest('Describe how you confirmed the payee (at least 8 characters)');
      if (normalizeEmail(confirmEmail ?? '') !== normalizeEmail(v.payeeEmail)) throw badRequest('The email you typed does not match the payee on file. Check it against what the vendor told you');
    }
    await setVendorStatus(db, vendorId, action === 'verify' ? 'verified' : 'blocked', userId, note);
    await audit(db, { actorKind: 'user', actorId: userId, action: action === 'verify' ? 'VENDOR_VERIFIED' : 'VENDOR_BLOCKED', subjectType: 'vendor', subjectId: vendorId, detail: { note: note.slice(0, 200) } });
  });
}

export const listVendorRows = () => pool().query(
  `select v.id, v.name, v.status, v.created_at, v.verified_at, v.verification_note, cu.name as created_by_name, vu.name as verified_by_name,
          (select count(*)::int from invoices i where i.vendor_id=v.id and i.status='PAID') as paid_count
   from vendors v left join users cu on cu.id=v.created_by left join users vu on vu.id=v.verified_by order by v.created_at desc`).then((r) => r.rows);

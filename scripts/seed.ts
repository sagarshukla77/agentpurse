
import './_env';
import { randomUUID } from 'node:crypto';
import { encrypt, sha256 } from '../src/core/security/crypto';
import { hashPassword } from '../src/core/security/password';
import { newTotpSecret } from '../src/core/security/totp';
import { MANDATE, VENDORS, vendorEmail } from '../fixtures/world';
import { pool, tx, q } from '../src/server/db';
import { env } from '../src/server/env';
import { audit } from '../src/server/repos/audit';
import { insertInvoice } from '../src/server/repos/invoices';
import { insertMandate } from '../src/server/repos/mandates';
import { insertUser } from '../src/server/repos/users';
import { insertVendor } from '../src/server/repos/vendors';
import { createAgent } from '../src/server/services/agents';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password-change-me';

async function main() {
  const existing = await q<{ c: string }>(
    pool(),
    'select count(*) c from mandates'
  );

  if (Number(existing[0].c) > 0) {
    console.log('Already seeded. (Drop the database to start over.)');
    return pool().end();
  }

  const passwordHash = await hashPassword(PASSWORD);
  const key = env().encryptionKey;

  const secrets = {
    owner: newTotpSecret(),
    approver: newTotpSecret(),
  };

  const ids = await tx(async (db) => {
    const owner = await insertUser(db, {
      email: 'owner@agentpurse.demo',
      name: 'Olivia Owner',
      role: 'owner',
      passwordHash,
      totpSecretEnc: encrypt(secrets.owner, key),
    });

    const approver = await insertUser(db, {
      email: 'approver@agentpurse.demo',
      name: 'Arjun Approver',
      role: 'approver',
      passwordHash,
      totpSecretEnc: encrypt(secrets.approver, key),
    });

    await insertUser(db, {
      email: 'viewer@agentpurse.demo',
      name: 'Vera Viewer',
      role: 'viewer',
      passwordHash,
      totpSecretEnc: null,
    });

    const allow: string[] = [];
    const created: { id: string; v: (typeof VENDORS)[number] }[] = [];

    for (const v of VENDORS) {
      const email = vendorEmail(v.key, process.env);

      const id = await insertVendor(db, {
        name: v.name,
        payeeEmail: email,
        createdBy: owner,
        status: v.status,
        verifiedBy: v.status === 'verified' ? approver : null,
        verificationNote:
          v.status === 'verified'
            ? 'Demo data: pre-verified by the seed script'
            : null,
      });

      created.push({ id, v });

      if (v.allowlisted) {
        allow.push(id);
      }
    }

    const mandateId = await insertMandate(db, {
      ...MANDATE,
      expiresAt: new Date(Date.now() + 45 * 86_400_000),
      vendorIds: allow,
      createdBy: owner,
      status: 'active',
    });

    await db.query(
      'update mandates set activated_by=$2 where id=$1',
      [mandateId, approver]
    );

    // Past paid invoices give the "first payment" and
    // "unusual amount" rules real history to work with.
    for (const { id, v } of created) {
      for (const cents of v.paidHistoryCents) {
        await insertInvoice(db, {
          mandateId,
          source: 'fixture',
          submittedByKind: 'user',
          submittedBy: owner,
          contentHash: sha256(randomUUID()),
          rawEnc: null,
          vendorId: id,
          vendorName: v.name,
          invoiceNumber: `HIST-${v.key}-${cents}`,
          amountCents: cents,
          currency: 'USD',
          dueDate: null,
          extracted: null,
          status: 'PAID',
        });
      }
    }

    await db.query(
      `update invoices
       set created_at = now() - interval '20 days'
       where invoice_number like 'HIST-%'`
    );

    await audit(db, {
      actorKind: 'system',
      action: 'DEMO_SEEDED',
      subjectType: 'system',
      detail: { vendors: VENDORS.length },
    });

    return { owner, mandateId };
  });

  // Create the demo procurement agent without printing its secret key.
  await createAgent(
    { name: 'Procurement bot', mandateId: ids.mandateId },
    ids.owner
  );

  console.log(`
  AgentPurse demo database seeded successfully.

  Demo logins:
    owner@agentpurse.demo
    approver@agentpurse.demo
    viewer@agentpurse.demo

  Demo password: configured through DEMO_PASSWORD.
  TOTP: DEMO_MODE is enabled.
  `);

  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

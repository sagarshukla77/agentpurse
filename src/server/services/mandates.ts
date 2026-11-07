import { replay } from '@/core/replay';
import { tx } from '../db';
import { badRequest, forbidden, notFound } from '../errors';
import { audit } from '../repos/audit';
import { decisionsForReplay } from '../repos/invoices';
import { getMandate, insertMandate, setMandateStatus, type NewMandate } from '../repos/mandates';

export async function createMandate(input: Omit<NewMandate, 'createdBy' | 'status'>, userId: string): Promise<string> {
  if (input.approvalThresholdCents > input.perPaymentCapCents) throw badRequest('The auto-approve limit cannot exceed the per-payment cap');
  if (input.perPaymentCapCents > input.budgetCents) throw badRequest('The per-payment cap cannot exceed the budget');
  if (input.expiresAt.getTime() <= Date.now()) throw badRequest('Expiry must be in the future');
  return tx(async (db) => {
    const id = await insertMandate(db, { ...input, createdBy: userId, status: 'pending_activation' });
    await audit(db, { actorKind: 'user', actorId: userId, action: 'MANDATE_CREATED', subjectType: 'mandate', subjectId: id, detail: { budgetCents: input.budgetCents, capCents: input.perPaymentCapCents, vendors: input.vendorIds.length } });
    return id;
  });
}

/** Maker-checker: spending authority only becomes live when a second person activates it. */
export async function activateMandate(id: string, userId: string): Promise<void> {
  await tx(async (db) => {
    const m = await getMandate(db, id, { lock: true });
    if (!m) throw notFound('Mandate not found');
    if (m.createdBy === userId) throw forbidden('You created this mandate, so someone else must activate it');
    await setMandateStatus(db, id, 'active', userId);
    await audit(db, { actorKind: 'user', actorId: userId, action: 'MANDATE_ACTIVATED', subjectType: 'mandate', subjectId: id });
  });
}

export async function suspendMandate(id: string, userId: string): Promise<void> {
  await tx(async (db) => {
    if (!(await getMandate(db, id, { lock: true }))) throw notFound('Mandate not found');
    await setMandateStatus(db, id, 'suspended', null);
    await audit(db, { actorKind: 'user', actorId: userId, action: 'MANDATE_SUSPENDED', subjectType: 'mandate', subjectId: id });
  });
}

/** "What would have happened under these rules?" Read-only. */
export async function dryRun(id: string, overrides: Partial<Pick<NewMandate, 'budgetCents' | 'perPaymentCapCents' | 'approvalThresholdCents' | 'velocityMaxPerHour'>>) {
  const { pool } = await import('../db');
  const m = await getMandate(pool(), id);
  if (!m) throw notFound('Mandate not found');
  const candidate = { ...m, ...overrides };
  return replay(await decisionsForReplay(id, 30), candidate);
}

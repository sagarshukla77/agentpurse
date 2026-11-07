import { tx } from '../db';
import { audit } from '../repos/audit';
import { getKillSwitch, setKillSwitch } from '../repos/flags';
import { notify } from './notify';

/** Engaging needs approver rights; releasing needs an owner (enforced by RBAC at the route). */
export async function engageKillSwitch(userId: string, reason: string) {
  await tx(async (db) => {
    await setKillSwitch(db, { engaged: true, by: userId, at: new Date().toISOString(), reason });
    await audit(db, { actorKind: 'user', actorId: userId, action: 'KILL_SWITCH_ENGAGED', subjectType: 'system', detail: { reason } });
  });
  void notify({ severity: 'critical', title: 'Kill switch engaged', body: `All payments are frozen. Reason: ${reason}` });
}

export async function releaseKillSwitch(userId: string) {
  await tx(async (db) => {
    await setKillSwitch(db, { engaged: false, by: userId, at: new Date().toISOString(), reason: null });
    await audit(db, { actorKind: 'user', actorId: userId, action: 'KILL_SWITCH_RELEASED', subjectType: 'system' });
  });
}

export const killSwitchState = async () => { const { pool } = await import('../db'); return getKillSwitch(pool()); };

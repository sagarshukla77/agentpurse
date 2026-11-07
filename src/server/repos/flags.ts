import { one, type Db } from '../db';

export interface KillSwitch { engaged: boolean; by: string | null; at: string | null; reason: string | null }
const OFF: KillSwitch = { engaged: false, by: null, at: null, reason: null };

export async function getKillSwitch(db: Db): Promise<KillSwitch> {
  const r = await one<{ value: KillSwitch }>(db, `select value from system_flags where key='kill_switch'`);
  return r?.value ?? OFF;
}
export const setKillSwitch = (db: Db, v: KillSwitch) =>
  db.query(`insert into system_flags (key,value) values ('kill_switch',$1) on conflict (key) do update set value=excluded.value, updated_at=now()`, [JSON.stringify(v)]);

/** Daily AI call counter: a hard cap so a loop or an attacker cannot run up the bill. */
export async function bumpAiCalls(db: Db, day: string): Promise<number> {
  const r = await one<{ value: { calls: number } }>(db,
    `insert into system_flags (key,value) values ($1, '{"calls":1}') on conflict (key) do update
       set value = jsonb_build_object('calls', (system_flags.value->>'calls')::int + 1), updated_at=now() returning value`, [`ai_calls:${day}`]);
  return r!.value.calls;
}

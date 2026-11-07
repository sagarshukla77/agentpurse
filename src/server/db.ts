import { Pool, types, type PoolClient } from 'pg';
import { env } from './env';

// DATE columns stay plain 'YYYY-MM-DD' strings (no timezone day-shift).
types.setTypeParser(1082, (v: string) => v);

const g = globalThis as unknown as { __apPool?: Pool };

export function pool(): Pool {
  return (g.__apPool ??= new Pool({
    connectionString: env().databaseUrl,
    ssl: env().dbSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    statement_timeout: 15_000,
  }));
}

/** Anything that can run a query: the pool or a transaction client. */
export type Db = Pick<PoolClient, 'query'>;

export async function tx<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export const q = <T = Record<string, unknown>>(db: Db, text: string, params: unknown[] = []) =>
  db.query(text, params).then((r) => r.rows as T[]);

export const one = async <T = Record<string, unknown>>(db: Db, text: string, params: unknown[] = []): Promise<T | null> =>
  (await q<T>(db, text, params))[0] ?? null;

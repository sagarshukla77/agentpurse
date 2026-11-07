import './_env';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../src/server/db';

async function main() {
  await pool().query(readFileSync(join(process.cwd(), 'db/schema.sql'), 'utf8'));
  console.log('Schema is up to date.');
  await pool().end();
}
main().catch((e) => { console.error(e); process.exit(1); });

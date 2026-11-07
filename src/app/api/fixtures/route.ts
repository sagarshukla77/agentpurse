import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asObject, asString, asUuid, ValidationError } from '@/core/validate';
import { api } from '@/server/http';
import { ingestInvoice } from '@/server/services/pipeline';
import type { FixtureItem } from '@/lib/dto';
import { renderFixture } from '../../../../fixtures/world';

const dir = () => join(process.cwd(), 'fixtures');
const manifest = (): FixtureItem[] => JSON.parse(readFileSync(join(dir(), 'manifest.json'), 'utf8'));

export const GET = api({ perm: 'invoice:read' }, async () => manifest().map((f) => ({ ...f, text: renderFixture(readFileSync(join(dir(), 'invoices', f.file), 'utf8'), process.env) })));

/** Runs one demo invoice through the real pipeline. Only names listed in the manifest are accepted. */
export const POST = api({ perm: 'invoice:submit', limit: { max: 30, windowMs: 60_000 } }, async ({ body, user }) => {
  const b = asObject(body);
  const file = asString(b.file, 'file', 100);
  if (!manifest().some((f) => f.file === file)) throw new ValidationError('file', 'unknown fixture');
  return ingestInvoice({ actor: { kind: 'user', id: user.id, label: user.name }, mandateId: asUuid(b.mandateId, 'mandateId'), source: 'fixture', text: renderFixture(readFileSync(join(dir(), 'invoices', file), 'utf8'), process.env) });
});

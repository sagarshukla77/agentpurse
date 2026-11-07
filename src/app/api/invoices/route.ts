import { asObject, asOptString, asString, asUuid, ValidationError } from '@/core/validate';
import { validateUpload } from '@/core/upload';
import { api } from '@/server/http';
import { listInvoices } from '@/server/repos/invoices';
import { dtos } from '@/server/dto';
import { ingestInvoice } from '@/server/services/pipeline';
import type { InvoiceRow } from '@/lib/dto';

export const GET = api({ perm: 'invoice:read' }, async () => dtos<InvoiceRow>(await listInvoices()));

export const POST = api({ perm: 'invoice:submit', limit: { max: 20, windowMs: 60_000 }, maxBodyBytes: 3_500_000 }, async ({ body, user }) => {
  const b = asObject(body);
  const mandateId = asUuid(b.mandateId, 'mandateId');
  const text = asOptString(b.text, 'text', 50_000);
  let file: { mime: string; base64: string } | undefined;
  if (b.file !== undefined) {
    const f = asObject(b.file, 'file');
    const base64 = asString(f.base64, 'file.base64', 3_000_000);
    const check = validateUpload(base64);
    if (!check.ok) throw new ValidationError('file', check.reason);
    file = { mime: check.mime, base64 };
  }
  if (!text && !file) throw new ValidationError('invoice', 'paste the invoice text or upload a file');
  return ingestInvoice({ actor: { kind: 'user', id: user.id, label: user.name }, mandateId, source: file ? 'upload' : 'paste', text: text ?? undefined, file });
});

import { decrypt } from '@/core/security/crypto';
import { can } from '@/core/security/rbac';
import { asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { dto } from '@/server/dto';
import { env } from '@/server/env';
import { notFound } from '@/server/errors';
import { listAudit } from '@/server/repos/audit';
import { getInvoiceDetail } from '@/server/repos/invoices';
import type { InvoiceDetail } from '@/lib/dto';

export const GET = api({ perm: 'invoice:read' }, async ({ params, user }) => {
  const id = asUuid(params.id, 'id');
  const d = await getInvoiceDetail(id);
  if (!d) throw notFound('Invoice not found');
  const events = await listAudit({ subjectId: id });

  let source: InvoiceDetail['source'] = null;
  if (can(user.role, 'source:read') && d.invoice.raw_enc) {
    const raw = JSON.parse(decrypt(String(d.invoice.raw_enc), env().encryptionKey)) as { kind: 'text'; text: string } | { kind: 'file'; mime: string; base64: string };
    source = raw.kind === 'text' ? raw : { kind: 'file', mime: raw.mime, dataUrl: raw.mime.startsWith('image/') ? `data:${raw.mime};base64,${raw.base64}` : null };
  }
  const out = {
    invoice: dto(d.invoice), decision: dto(d.decision), payment: dto(d.payment), approval: dto(d.approval), events, source,
  };
  return out;
});

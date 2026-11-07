import { verifyChain } from '@/core/audit/chain';
import { api } from '@/server/http';
import { allAuditOrdered } from '@/server/repos/audit';

export const GET = api({ perm: 'audit:read' }, async () => {
  const records = await allAuditOrdered();
  const r = verifyChain(records);
  return { ...r, head: records.at(-1)?.hash ?? null, brokenSeq: r.brokenAtIndex === undefined ? null : r.brokenAtIndex + 1 };
});

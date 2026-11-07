import { api } from '@/server/http';
import { listAudit } from '@/server/repos/audit';

export const GET = api({ perm: 'audit:read' }, async ({ req }) => {
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 200);
  return listAudit({ limit: Number.isFinite(limit) ? limit : 200 });
});

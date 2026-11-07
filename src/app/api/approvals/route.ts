import { api } from '@/server/http';
import { listPending } from '@/server/repos/approvals';
import { dtos } from '@/server/dto';
import type { PendingApproval } from '@/lib/dto';

export const GET = api({ perm: 'invoice:read' }, async () => dtos<PendingApproval>(await listPending()));

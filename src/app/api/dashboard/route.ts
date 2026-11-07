import { api } from '@/server/http';
import { dashboard } from '@/server/services/dashboard';

export const GET = api({ perm: 'invoice:read' }, () => dashboard());

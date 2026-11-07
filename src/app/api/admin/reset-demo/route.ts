import { api } from '@/server/http';
import { resetDemoData } from '@/server/services/demo';

export const POST = api({ perm: 'demo:reset', limit: { max: 5, windowMs: 60_000 } }, ({ user }) => resetDemoData(user.id));

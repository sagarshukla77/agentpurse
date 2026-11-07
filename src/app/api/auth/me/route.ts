import { api } from '@/server/http';

export const GET = api({}, async ({ user }) => ({ id: user.id, email: user.email, name: user.name, role: user.role }));

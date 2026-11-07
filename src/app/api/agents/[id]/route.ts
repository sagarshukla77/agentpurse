import { asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { revoke } from '@/server/services/agents';

export const DELETE = api({ perm: 'agent:manage' }, async ({ params, user }) => { await revoke(asUuid(params.id, 'id'), user.id); });

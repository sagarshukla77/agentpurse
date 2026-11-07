import { asEnum, asObject, asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { activateMandate, suspendMandate } from '@/server/services/mandates';
import { forbidden } from '@/server/errors';
import { can } from '@/core/security/rbac';

export const POST = api({ perm: 'mandate:activate' }, async ({ params, body, user }) => {
  const action = asEnum(asObject(body).action, 'action', ['activate', 'suspend'] as const);
  const id = asUuid(params.id, 'id');
  if (action === 'activate') await activateMandate(id, user.id);
  else { if (!can(user.role, 'killswitch:engage')) throw forbidden(); await suspendMandate(id, user.id); }
});

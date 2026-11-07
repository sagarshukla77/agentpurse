import { asEnum, asObject, asString } from '@/core/validate';
import { can } from '@/core/security/rbac';
import { api } from '@/server/http';
import { forbidden } from '@/server/errors';
import { engageKillSwitch, killSwitchState, releaseKillSwitch } from '@/server/services/kill-switch';

export const GET = api({ perm: 'invoice:read' }, () => killSwitchState());
export const POST = api({ perm: 'killswitch:engage' }, async ({ body, user }) => {
  const b = asObject(body);
  if (asEnum(b.action, 'action', ['engage', 'release'] as const) === 'engage') await engageKillSwitch(user.id, asString(b.reason ?? 'Manual freeze', 'reason', 200));
  else { if (!can(user.role, 'killswitch:release')) throw forbidden('Only an owner can release the kill switch'); await releaseKillSwitch(user.id); }
  return killSwitchState();
});

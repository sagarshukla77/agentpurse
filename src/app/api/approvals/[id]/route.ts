import { asEnum, asObject, asOptString, asString, asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { decide, openApproval } from '@/server/services/approvals';

export const GET = api({ perm: 'approval:decide' }, ({ params, user }) => openApproval(asUuid(params.id, 'id'), user));

export const POST = api({ perm: 'approval:decide', limit: { max: 20, windowMs: 60_000 } }, ({ params, body, user }) => {
  const b = asObject(body);
  return decide(asUuid(params.id, 'id'), user, {
    action: asEnum(b.action, 'action', ['approve', 'reject'] as const),
    token: asString(b.token, 'token', 2000),
    note: asOptString(b.note, 'note', 500),
    totp: asOptString(b.totp, 'totp', 10) ?? undefined,
  });
});

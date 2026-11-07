import { asEnum, asObject, asOptString, asString, asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { reviewVendor } from '@/server/services/vendors';

export const POST = api({ perm: 'vendor:verify' }, async ({ params, body, user }) => {
  const b = asObject(body);
  await reviewVendor(
    asUuid(params.id, 'id'), asEnum(b.action, 'action', ['verify', 'block'] as const),
    asString(b.note ?? '', 'note', 300, 0), user.id, asOptString(b.confirmEmail, 'confirmEmail', 254) ?? undefined,
  );
});

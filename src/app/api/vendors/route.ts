import { asEmail, asObject, asString } from '@/core/validate';
import { api } from '@/server/http';
import { dtos } from '@/server/dto';
import { createVendor, listVendorRows } from '@/server/services/vendors';
import type { VendorRow } from '@/lib/dto';

export const GET = api({ perm: 'invoice:read' }, async () => dtos<VendorRow>(await listVendorRows()));
export const POST = api({ perm: 'vendor:create' }, async ({ body, user }) => {
  const b = asObject(body);
  return { id: await createVendor({ name: asString(b.name, 'name', 120), payeeEmail: asEmail(b.payeeEmail, 'payeeEmail') }, user.id) };
});

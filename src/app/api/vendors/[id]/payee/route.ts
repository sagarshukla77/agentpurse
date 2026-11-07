import { asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { revealPayee } from '@/server/services/vendors';

/** Only people allowed to verify vendors may see the real payee email, and every view is audited. */
export const GET = api({ perm: 'vendor:verify', limit: { max: 30, windowMs: 60_000 } }, ({ params, user }) => revealPayee(asUuid(params.id, 'id'), user.id));

import { asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { cancelPayment } from '@/server/services/payments';

export const POST = api({ perm: 'invoice:cancel' }, async ({ params, user }) => { await cancelPayment(asUuid(params.id, 'id'), user); });

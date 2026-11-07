import { asInt, asObject, asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { dryRun } from '@/server/services/mandates';

export const POST = api({ perm: 'invoice:read' }, ({ params, body }) => {
  const b = asObject(body);
  const opt = (k: string, min: number, max: number) => (b[k] === undefined ? {} : { [k]: asInt(b[k], k, min, max) });
  return dryRun(asUuid(params.id, 'id'), { ...opt('budgetCents', 100, 1e9), ...opt('perPaymentCapCents', 100, 1e9), ...opt('approvalThresholdCents', 0, 1e9), ...opt('velocityMaxPerHour', 1, 1000) });
});

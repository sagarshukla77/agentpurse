import { asArray, asInt, asObject, asString, asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { mandateSummaries } from '@/server/services/dashboard';
import { createMandate } from '@/server/services/mandates';

export const GET = api({ perm: 'invoice:read' }, () => mandateSummaries());

export const POST = api({ perm: 'mandate:create' }, async ({ body, user }) => {
  const b = asObject(body);
  const id = await createMandate({
    name: asString(b.name, 'name', 100),
    currency: asString(b.currency ?? 'USD', 'currency', 3, 3).toUpperCase(),
    budgetCents: asInt(b.budgetCents, 'budgetCents', 100, 1e9),
    perPaymentCapCents: asInt(b.perPaymentCapCents, 'perPaymentCapCents', 100, 1e9),
    approvalThresholdCents: asInt(b.approvalThresholdCents, 'approvalThresholdCents', 0, 1e9),
    velocityMaxPerHour: asInt(b.velocityMaxPerHour, 'velocityMaxPerHour', 1, 1000),
    expiresAt: new Date(asString(b.expiresAt, 'expiresAt', 40)),
    vendorIds: asArray(b.vendorIds, 'vendorIds', 200).map((v, i) => asUuid(v, `vendorIds[${i}]`)),
  }, user.id);
  return { id };
});

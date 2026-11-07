import { BUDGET_CONSUMING } from '@/core/state-machine';
import { env } from '../env';
import { pool, q } from '../db';
import { listAudit } from '../repos/audit';
import { getKillSwitch } from '../repos/flags';
import { listMandates } from '../repos/mandates';

export async function mandateSummaries() {
  const mandates = await listMandates();
  const rows = await q<{ mandate_id: string; status: string; cents: string }>(pool(), `select mandate_id, status, sum(amount_cents) as cents from payments group by mandate_id, status`);
  const byMandate = mandates.map((m) => {
    const mine = rows.filter((r) => r.mandate_id === m.id);
    const sum = (f: (s: string) => boolean) => mine.filter((r) => f(r.status)).reduce((a, r) => a + Number(r.cents), 0);
    return {
      id: m.id, name: m.name, status: m.status, currency: m.currency, budgetCents: m.budgetCents, perPaymentCapCents: m.perPaymentCapCents,
      approvalThresholdCents: m.approvalThresholdCents, velocityMaxPerHour: m.velocityMaxPerHour, vendorIds: m.vendorIds, expiresAt: m.expiresAt,
      paidCents: sum((s) => s === 'PAID'),
      inFlightCents: sum((s) => BUDGET_CONSUMING.includes(s as never) && s !== 'PAID'),
    };
  });
  return byMandate;
}

export async function dashboard() {
  const byMandate = await mandateSummaries();
  const counts = await q<{ status: string; c: string }>(pool(), 'select status, count(*) c from invoices group by status');
  const pending = await q<{ c: string }>(pool(), `select count(*) c from approvals where status='pending'`);
  return {
    mandates: byMandate,
    invoiceCounts: Object.fromEntries(counts.map((r) => [r.status, Number(r.c)])),
    pendingApprovals: Number(pending[0]?.c ?? 0),
    killSwitch: await getKillSwitch(pool()),
    recent: (await listAudit({ limit: 12 })).map((e) => ({ id: e.id, ts: e.ts, action: e.action, actorKind: e.actorKind, subjectType: e.subjectType, subjectId: e.subjectId })),
    paypalMode: env().paypal.live ? 'sandbox' : 'simulated',
    aiMode: env().ai.mode,
    demoMode: env().demoMode,
    holdSeconds: env().holdSeconds,
  };
}

import type { Mandate, VendorFacts } from '@/core/types';
import type { HistoryInvoice } from '@/core/risk/checks';
import type { Db } from '../db';
import { getKillSwitch } from '../repos/flags';
import { liveHistory, paidAmounts } from '../repos/invoices';
import { committedCents, paymentsLastHour } from '../repos/payments';
import type { VendorWithPayee } from '../repos/vendors';

export interface World {
  killSwitch: boolean;
  spentCents: number;
  paymentsLastHour: number;
  history: HistoryInvoice[];
  paidHistoryCents: number[];
  vendorFacts: VendorFacts;
}

/** Everything the policy needs to know about the present. Call inside the mandate-locked transaction. */
export async function loadWorld(db: Db, mandate: Mandate, vendor: VendorWithPayee | null): Promise<World> {
  const paid = vendor ? await paidAmounts(db, vendor.id) : [];
  return {
    killSwitch: (await getKillSwitch(db)).engaged,
    spentCents: await committedCents(db, mandate.id),
    paymentsLastHour: await paymentsLastHour(db, mandate.id),
    history: await liveHistory(db),
    paidHistoryCents: paid,
    vendorFacts: vendor
      ? { status: vendor.status, allowlisted: mandate.vendorIds.includes(vendor.id), priorPaidCount: paid.length }
      : { status: 'unknown', allowlisted: false, priorPaidCount: 0 },
  };
}

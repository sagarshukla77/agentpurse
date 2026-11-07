import type { InvoiceStatus, PaymentStatus, Verdict } from '@/core/types';
import { INVOICE_STATUS, PAYMENT_STATUS, VERDICT } from '@/lib/format';
import { Badge } from '../ui';

export const VerdictBadge = ({ v }: { v: Verdict | null | undefined }) => v ? <Badge tone={VERDICT[v].tone}>{VERDICT[v].label}</Badge> : <span className="faint">–</span>;
export const InvoiceStatusBadge = ({ s }: { s: InvoiceStatus }) => <Badge tone={INVOICE_STATUS[s].tone}>{INVOICE_STATUS[s].label}</Badge>;
export const PaymentStatusBadge = ({ s }: { s: PaymentStatus | null | undefined }) => s ? <Badge tone={PAYMENT_STATUS[s].tone}>{PAYMENT_STATUS[s].label}</Badge> : <span className="faint">–</span>;

'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { can } from '@/core/security/rbac';
import { api } from '@/lib/api';
import type { InvoiceDetail } from '@/lib/dto';
import { dateOnly, dateTime, money } from '@/lib/format';
import { useAction, useApi, useMe } from '@/lib/hooks';
import { Button, Card, Loading, Notice, PageHead, useToast } from '@/components/ui';
import { InvoiceStatusBadge, PaymentStatusBadge, VerdictBadge } from '@/components/domain/badges';
import { RuleTrace } from '@/components/domain/RuleTrace';
import { Timeline } from '@/components/domain/Timeline';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<InvoiceDetail>(`/api/invoices/${id}`, { refreshMs: 3000 });
  const cancel = useAction(async () => { await api(`/api/invoices/${id}/cancel`, { method: 'POST', body: {} }); toast('Payment canceled'); await reload(); });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (loading) return <Loading />;
  if (error || !data) return <Notice tone="bad">{error ?? 'Not found'}</Notice>;
  const { invoice, decision, payment, approval, events, source } = data;
  const x = invoice.extracted;
  const holdLeft = payment?.status === 'QUEUED' ? Math.max(0, Math.round((new Date(payment.releaseAt).getTime() - now) / 1000)) : null;
  const lineSum = x?.lineItems.reduce((s, l) => s + l.amountCents, 0) ?? 0;

  return (
    <>
      <PageHead title={invoice.vendorName ?? 'Unreadable document'} sub={<><Link href="/invoices">Invoices</Link> / {invoice.invoiceNumber ?? invoice.id.slice(0, 8)}</>}>
        <VerdictBadge v={decision?.verdict} /><InvoiceStatusBadge s={invoice.status} />
      </PageHead>

      <div className="grid-2">
        <div className="stack">
          <Card>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div><div className="muted">Amount</div><div className="big-amount num">{money(invoice.amountCents, invoice.currency ?? 'USD')}</div></div>
              <div className="muted" style={{ textAlign: 'right' }}>Received {dateTime(invoice.createdAt)}<br />{invoice.submittedByKind === 'agent' ? 'Requested by an AI agent' : `Via ${invoice.source}`}</div>
            </div>
            {decision?.explanation && <div style={{ marginTop: 14 }}><Notice tone={decision.verdict === 'ALLOW' ? 'good' : decision.verdict === 'DENY' ? 'bad' : 'warn'}>{decision.explanation}</Notice></div>}
            {!decision && <div style={{ marginTop: 14 }}><Notice tone="warn">This document could not be read reliably, so no payment was proposed. A person should review the source.</Notice></div>}
          </Card>

          {decision && <Card title="Every gate it had to pass" actions={<span className="faint">policy v{decision.policyVersion}</span>}><RuleTrace trace={decision.trace} /></Card>}

          <Card title="What the AI read vs. the original">
            <div className="grid-2" style={{ gap: 16 }}>
              <div>
                <h3 style={{ marginBottom: 8 }}>Original document</h3>
                {source?.kind === 'text' && <pre className="doc">{source.text}</pre>}
                {source?.kind === 'file' && (source.dataUrl ? <img className="doc-img" src={source.dataUrl} alt="Uploaded invoice" /> : <p className="muted">PDF on file ({source.mime}). Preview is not shown.</p>)}
                {!source && <p className="muted">You do not have permission to view source documents.</p>}
              </div>
              <div>
                <h3 style={{ marginBottom: 8 }}>Extracted fields</h3>
                {x ? (
                  <dl className="kv">
                    <dt>Vendor</dt><dd>{x.vendorName}{invoice.vendorRegistryName ? <span className="faint"> → {invoice.vendorRegistryName}</span> : <span className="faint"> (not in registry)</span>}</dd>
                    <dt>Payee email</dt><dd className="mono">{x.vendorEmail ?? '–'}</dd>
                    <dt>Invoice #</dt><dd>{x.invoiceNumber ?? '–'}</dd>
                    <dt>Total</dt><dd className="num">{money(x.amountCents, x.currency)}</dd>
                    <dt>Due</dt><dd>{dateOnly(x.dueDate)}</dd>
                    <dt>Line items</dt><dd>{x.lineItems.length ? x.lineItems.map((l, i) => <div key={i} className="row" style={{ justifyContent: 'space-between' }}><span>{l.description}</span><span className="num">{money(l.amountCents, x.currency)}</span></div>) : '–'}{x.lineItems.length > 0 && lineSum !== x.amountCents && <span style={{ color: 'var(--bad)' }}>Items add to {money(lineSum, x.currency)}</span>}</dd>
                    <dt>AI confidence</dt><dd><div className="row"><div className="meter"><i style={{ width: `${x.confidence * 100}%` }} /></div><span className="num">{Math.round(x.confidence * 100)}%</span></div></dd>
                  </dl>
                ) : <p className="muted">Nothing extracted.</p>}
                <p className="hint" style={{ marginTop: 10 }}>The payee is always taken from the verified vendor record, never from this invoice.</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Payment">
            {payment ? (
              <div className="stack-sm">
                <div className="row" style={{ justifyContent: 'space-between' }}><PaymentStatusBadge s={payment.status} /><b className="num">{money(payment.amountCents, payment.currency)}</b></div>
                {holdLeft !== null && <Notice tone="info">Holding for <b className="num">{holdLeft}s</b>. You can still cancel; after that the money is on its way.</Notice>}
                {payment.paypalBatchId && <dl className="kv"><dt>PayPal batch</dt><dd className="mono">{payment.paypalBatchId}</dd></dl>}
                {payment.lastError && <Notice tone="warn">{payment.lastError}</Notice>}
                {payment.status === 'QUEUED' && me.data && can(me.data.role, 'invoice:cancel') && <Button variant="danger" disabled={cancel.pending} onClick={() => cancel.run()}>Cancel this payment</Button>}
                {cancel.error && <Notice tone="bad">{cancel.error}</Notice>}
              </div>
            ) : approval?.status === 'pending' ? (
              <div className="stack-sm"><Notice tone="warn">Waiting for a person to approve.</Notice><Link className="btn btn-primary" href="/approvals">Review approval</Link></div>
            ) : <p className="muted">No payment was made.</p>}
          </Card>
          <Card title="What happened"><Timeline events={events} /></Card>
        </div>
      </div>
    </>
  );
}

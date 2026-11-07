'use client';
import Link from 'next/link';
import { useState } from 'react';
import { can } from '@/core/security/rbac';
import { api } from '@/lib/api';
import type { ApprovalView, PendingApproval } from '@/lib/dto';
import { ago, money } from '@/lib/format';
import { useAction, useApi, useMe } from '@/lib/hooks';
import { Button, Card, Drawer, Empty, Field, Loading, Notice, PageHead, useToast } from '@/components/ui';
import { RuleTrace } from '@/components/domain/RuleTrace';

export default function ApprovalsPage() {
  const me = useMe();
  const list = useApi<PendingApproval[]>('/api/approvals', { refreshMs: 5000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const canDecide = !!me.data && can(me.data.role, 'approval:decide');

  return (
    <>
      <PageHead title="Approvals" sub="Payments the rules would not make on their own. Nothing moves until a person says so." />
      {list.loading ? <Loading /> : !list.data?.length ? <Card><Empty>All clear. Nothing needs approval.</Empty></Card> : (
        <div className="stack">
          {list.data.map((a) => (
            <Card key={a.approvalId}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="stack-sm">
                  <div className="row"><h2>{a.vendorName}</h2><span className="faint">{a.invoiceNumber} · {ago(a.createdAt)}{a.submittedByKind === 'agent' ? ' · requested by an AI agent' : ''}</span></div>
                  <div className="muted">{a.explanation ?? a.reasons.map((r) => r.detail).join('; ')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{money(a.amountCents, a.currency)}</div>
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                    <Link className="btn btn-sm" href={`/invoices/${a.invoiceId}`}>Details</Link>
                    {canDecide && <Button size="sm" variant="primary" onClick={() => setOpenId(a.approvalId)}>Review</Button>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {openId && <ReviewDrawer id={openId} onClose={() => setOpenId(null)} onDone={() => { setOpenId(null); void list.reload(); }} />}
    </>
  );
}

function ReviewDrawer({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data, error, loading } = useApi<ApprovalView>(`/api/approvals/${id}`);
  const [note, setNote] = useState('');
  const [totp, setTotp] = useState('');
  const decide = useAction(async (action: 'approve' | 'reject') => {
    await api(`/api/approvals/${id}`, { body: { action, token: data!.token, note: note || undefined, totp: totp || undefined } });
    toast(action === 'approve' ? 'Approved. The payment is queued, with a short window to cancel.' : 'Rejected');
    onDone();
  });

  return (
    <Drawer title="Review before any money moves" onClose={onClose}>
      {loading ? <Loading /> : error || !data ? <Notice tone="bad">{error}</Notice> : (
        <>
          <div className="card card-pad">
            <div className="muted">You are about to pay</div>
            <div className="big-amount num">{money(data.amountCents, data.currency)}</div>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>To</dt><dd>{data.vendorName}</dd>
              <dt>PayPal account</dt><dd className="mono">{data.payeeEmailMasked ?? '–'}</dd>
              <dt>Invoice</dt><dd>{data.invoiceNumber ?? '–'}</dd>
            </dl>
            <p className="hint" style={{ marginTop: 8 }}>The destination is the verified vendor record, not anything written on the invoice.</p>
          </div>
          <div><h3 style={{ marginBottom: 6 }}>Why it needs you</h3><RuleTrace trace={data.reasons} /></div>
          {data.makerChecker && <Notice tone="warn">You submitted this invoice, so someone else must approve it. This is the two-person rule working as designed.{process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? ' To try it: open a private window and sign in as approver@agentpurse.demo.' : ''}</Notice>}
          <Field label="Note (optional)"><input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
          {data.needsStepUp && <Field label="Authenticator code" hint="Payments this size need a fresh code."><input className="input num" inputMode="numeric" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} /></Field>}
          {decide.error && <Notice tone="bad">{decide.error}</Notice>}
          <div className="row">
            <Button variant="good" disabled={decide.pending || data.makerChecker} onClick={() => decide.run('approve')}>Approve payment</Button>
            <Button variant="danger" disabled={decide.pending} onClick={() => decide.run('reject')}>Reject</Button>
          </div>
        </>
      )}
    </Drawer>
  );
}

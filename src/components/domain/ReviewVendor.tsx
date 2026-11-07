'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { VendorRow } from '@/lib/dto';
import { useAction, useApi } from '@/lib/hooks';
import { Button, Drawer, Field, Loading, Notice, useToast } from '../ui';

interface Payee { name: string; status: string; payeeEmail: string; addedByYou: boolean }

/** Verifying a vendor is a deliberate act: see the real email, confirm it through a trusted channel, retype it, say how. */
export function ReviewVendor({ vendor, action, onClose, onDone }: { vendor: VendorRow; action: 'verify' | 'block'; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const payee = useApi<Payee>(action === 'verify' ? `/api/vendors/${vendor.id}/payee` : null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [note, setNote] = useState('');
  const [trusted, setTrusted] = useState(false);

  const submit = useAction(async () => {
    await api(`/api/vendors/${vendor.id}`, { body: { action, note, confirmEmail: action === 'verify' ? confirmEmail : undefined } });
    toast(action === 'verify' ? 'Vendor verified' : 'Vendor blocked');
    onDone();
  });

  const verifyReady = trusted && note.trim().length >= 8 && confirmEmail.trim().length > 3;

  return (
    <Drawer title={action === 'verify' ? `Verify ${vendor.name}` : `Block ${vendor.name}`} onClose={onClose}>
      {action === 'verify' ? (
        payee.loading ? <Loading /> : payee.error || !payee.data ? <Notice tone="bad">{payee.error}</Notice> : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit.run(); }}>
            {payee.data.addedByYou && <Notice tone="warn">You added this vendor, so someone else must verify it.</Notice>}
            <div className="card card-pad">
              <div className="muted">Money for this vendor will be sent to</div>
              <div className="mono" style={{ fontSize: 20, margin: '6px 0', wordBreak: 'break-all' }}>{payee.data.payeeEmail}</div>
              <p className="hint">Whoever typed this in could have made a mistake or be lying. Do not trust it until you have checked it yourself.</p>
            </div>
            <Notice tone="info">Contact the vendor using a phone number or email you <b>already had</b>, not one from an invoice or from the message asking you to add them, and ask them to read out the PayPal email they want to be paid at.</Notice>
            <label className="row" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={trusted} onChange={(e) => setTrusted(e.target.checked)} style={{ marginTop: 4 }} />
              <span>I confirmed this PayPal email with the vendor through a channel I already trusted.</span>
            </label>
            <Field label="Type the PayPal email exactly as shown" hint="This makes sure you actually looked at it."><input className="input mono" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" spellCheck={false} /></Field>
            <Field label="How did you confirm it?" hint="Recorded in the audit trail. For example: Called Priya at the number on our contract, 3 Nov."><textarea className="textarea" style={{ minHeight: 80, fontFamily: 'var(--font)' }} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
            {submit.error && <Notice tone="bad">{submit.error}</Notice>}
            <div className="row"><Button variant="good" type="submit" disabled={submit.pending || !verifyReady || payee.data.addedByYou}>Verify vendor</Button><Button type="button" onClick={onClose}>Cancel</Button></div>
          </form>
        )
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit.run(); }}>
          <Notice tone="warn">A blocked vendor can never be paid. This cannot be undone from the screen.</Notice>
          <Field label="Why are you blocking this vendor?"><input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
          {submit.error && <Notice tone="bad">{submit.error}</Notice>}
          <div className="row"><Button variant="danger" type="submit" disabled={submit.pending || note.trim().length < 3}>Block vendor</Button><Button type="button" onClick={onClose}>Cancel</Button></div>
        </form>
      )}
    </Drawer>
  );
}

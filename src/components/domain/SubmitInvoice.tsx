'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { IngestResponse, MandateSummary } from '@/lib/dto';
import { useAction } from '@/lib/hooks';
import { VERDICT } from '@/lib/format';
import Link from 'next/link';
import { Button, Drawer, Field, Notice } from '../ui';

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = () => rej(new Error('Could not read the file'));
  r.readAsDataURL(f);
});

export function SubmitInvoice({ mandates, onClose, onDone }: { mandates: MandateSummary[]; onClose: () => void; onDone: () => void }) {
  const active = mandates.filter((m) => m.status === 'active');
  const [mandateId, setMandateId] = useState(active[0]?.id ?? '');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);

  const submit = useAction(async () => {
    const body = file ? { mandateId, file: { base64: await toBase64(file) } } : { mandateId, text };
    const r = await api<IngestResponse>('/api/invoices', { body });
    setResult(r); onDone();
  });

  return (
    <Drawer title="Submit an invoice" onClose={onClose}>
      {active.length === 0 && <Notice tone="warn">There is no active mandate. Create one and have a second person activate it.</Notice>}
      {result ? (
        <div className="stack">
          <Notice tone={result.verdict === 'ALLOW' ? 'good' : result.verdict === 'DENY' ? 'bad' : 'warn'}>
            <div><b>{result.verdict === 'NEEDS_REVIEW' ? 'Needs review' : VERDICT[result.verdict].label}.</b> {result.explanation ?? result.reasons.map((r) => r.detail).join(' ')}</div>
          </Notice>
          <div className="row"><Link className="btn btn-primary" href={`/invoices/${result.invoiceId}`}>See the full decision</Link><Button onClick={() => { setResult(null); setText(''); setFile(null); }}>Submit another</Button></div>
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit.run(); }}>
          {submit.error && <Notice tone="bad">{submit.error}</Notice>}
          <Field label="Mandate"><select className="select" value={mandateId} onChange={(e) => setMandateId(e.target.value)}>{active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label="Invoice text" hint="Paste the invoice. Or upload a PDF/image below (needs AI_MODE=anthropic).">
            <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} disabled={!!file} placeholder={'Vendor: Northwind Design Studio\nInvoice #: NW-3001\nCurrency: USD\nTotal: 300.00'} />
          </Field>
          <Field label="…or upload a file" hint="PDF, PNG or JPEG, up to 2 MB. Checked by content, not file name.">
            <input className="input" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Button variant="primary" type="submit" disabled={submit.pending || !mandateId || (!text.trim() && !file)}>{submit.pending ? 'Checking…' : 'Check and submit'}</Button>
        </form>
      )}
    </Drawer>
  );
}

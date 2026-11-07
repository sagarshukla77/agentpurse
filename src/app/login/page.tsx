'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Field, Notice } from '@/components/ui';

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';
const ACCOUNTS = [
  { label: 'Owner', email: 'owner@agentpurse.demo' },
  { label: 'Approver', email: 'approver@agentpurse.demo' },
  { label: 'Viewer', email: 'viewer@agentpurse.demo' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const login = useAction(async () => {
    await api('/api/auth/login', { body: { email, password, totp: totp || undefined } });
    window.location.assign('/');
  });

  return (
    <main className="login">
      <section className="login-art">
        <div className="brand"><span className="brand-mark"><i /></span>AgentPurse</div>
        <div>
          <h1>Give your AI a <em>budget</em>, not your bank login.</h1>
          <p>Agents and invoices ask. A rules engine you control decides. PayPal moves the money only when every gate is open.</p>
        </div>
        <div className="principles">
          <div><span>01</span>The AI proposes; plain code decides. Documents can never talk their way past a rule.</div>
          <div><span>02</span>Money only goes to payees a second person has verified.</div>
          <div><span>03</span>Every action is written to a tamper-evident audit trail.</div>
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={(e) => { e.preventDefault(); void login.run(); }}>
          <div><h1 style={{ fontSize: 24 }}>Sign in</h1><p className="muted">Sandbox environment. No real money moves.</p></div>
          {login.error && <Notice tone="bad">{login.error}</Notice>}
          <Field label="Email"><input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {!DEMO && <Field label="Authenticator code" hint="Required for owners and approvers"><input className="input num" inputMode="numeric" maxLength={6} placeholder="123456" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} /></Field>}
          <Button variant="primary" disabled={login.pending} type="submit">{login.pending ? 'Signing in…' : 'Sign in'}</Button>
          {DEMO && (
            <div className="stack-sm">
              <span className="hint">Demo accounts: pick a role to try it. Each sees a different product.</span>
              <div className="row">{ACCOUNTS.map((a) => <Button key={a.email} size="sm" type="button" onClick={() => { setEmail(a.email); if (DEMO_PASSWORD) setPassword(DEMO_PASSWORD); }}>{a.label}</Button>)}</div>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

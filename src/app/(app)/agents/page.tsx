'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { AgentRow, MandateRow } from '@/lib/dto';
import { ago } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { Badge, Button, Card, Empty, Field, Loading, Notice, PageHead, useToast } from '@/components/ui';

export default function AgentsPage() {
  const toast = useToast();
  const agents = useApi<AgentRow[]>('/api/agents', { refreshMs: 8000 });
  const mandates = useApi<MandateRow[]>('/api/mandates');
  const [name, setName] = useState('');
  const [mandateId, setMandateId] = useState('');
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const active = (mandates.data ?? []).filter((m) => m.status === 'active');

  const create = useAction(async () => {
    const r = await api<{ key: string; agent: AgentRow }>('/api/agents', { body: { name, mandateId: mandateId || active[0]?.id } });
    setFresh({ key: r.key, name: r.agent.name }); setName(''); await agents.reload();
  });
  const revoke = useAction(async (id: string) => { await api(`/api/agents/${id}`, { method: 'DELETE' }); toast('Agent key revoked'); await agents.reload(); });

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.onrender.com';
  const config = fresh ? JSON.stringify({ mcpServers: { agentpurse: { command: 'npx', args: ['tsx', 'scripts/mcp-stdio.ts'], cwd: '/path/to/agentpurse', env: { AGENTPURSE_URL: origin, AGENTPURSE_KEY: fresh.key } } } }, null, 2) : '';

  return (
    <>
      <PageHead title="AI agents" sub="Give any AI agent bounded spending authority. Each key is tied to one mandate and can be revoked instantly." />
      <div className="stack">
        <Card title="Issue an agent key">
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void create.run(); }}>
            {create.error && <Notice tone="bad">{create.error}</Notice>}
            <div className="form-grid">
              <Field label="Agent name"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Procurement bot" /></Field>
              <Field label="Mandate"><select className="select" value={mandateId || active[0]?.id || ''} onChange={(e) => setMandateId(e.target.value)}>{active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
            </div>
            <div><Button variant="primary" type="submit" disabled={create.pending || !active.length}>Issue key</Button></div>
          </form>
        </Card>

        {fresh && (
          <Card title={`Key for ${fresh.name}: copy it now`}>
            <div className="stack">
              <Notice tone="warn">This key is shown once and stored only as a hash. If you lose it, revoke it and issue a new one.</Notice>
              <pre className="doc">{fresh.key}</pre>
              <div><h3 style={{ marginBottom: 6 }}>Connect it to Claude Desktop</h3><p className="hint" style={{ marginBottom: 8 }}>Add this to <span className="mono">claude_desktop_config.json</span>, then restart Claude. The agent gets three tools: <span className="mono">request_payment</span>, <span className="mono">check_budget</span>, <span className="mono">get_payment_status</span>.</p><pre className="doc">{config}</pre></div>
              <div><Button onClick={() => setFresh(null)}>I have saved it</Button></div>
            </div>
          </Card>
        )}

        <Card title="Issued keys" pad={false}>
          {agents.loading ? <Loading /> : !agents.data?.length ? <Empty>No agents yet.</Empty> : agents.data.map((a) => (
            <div key={a.id} className="row" style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)', justifyContent: 'space-between' }}>
              <div><b>{a.name}</b> <span className="mono faint">{a.keyPrefix}…</span><div className="muted">Issued {ago(a.createdAt)} · {a.lastUsedAt ? `last used ${ago(a.lastUsedAt)}` : 'never used'}</div></div>
              <div className="row"><Badge tone={a.status === 'active' ? 'good' : 'neutral'}>{a.status}</Badge>{a.status === 'active' && <Button size="sm" variant="danger" onClick={() => confirm(`Revoke ${a.name}?`) && revoke.run(a.id)}>Revoke</Button>}</div>
            </div>))}
        </Card>
      </div>
    </>
  );
}

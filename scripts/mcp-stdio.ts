/**
 * stdio ⇄ HTTP bridge so Claude Desktop (which speaks MCP over stdio) can use AgentPurse.
 * Needs AGENTPURSE_URL (e.g. https://your-app.onrender.com) and AGENTPURSE_KEY (an agent key).
 */
import { createInterface } from 'node:readline';

const url = `${(process.env.AGENTPURSE_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/api/mcp`;
const key = process.env.AGENTPURSE_KEY ?? '';
if (!key) { console.error('AGENTPURSE_KEY is required'); process.exit(1); }

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let id: unknown = null;
  try {
    id = JSON.parse(line).id ?? null;
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: line });
    if (res.status === 202) return; // notification, no reply
    process.stdout.write(`${await res.text()}\n`);
  } catch (e) {
    if (id !== null) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: e instanceof Error ? e.message : 'bridge error' } })}\n`);
  }
});

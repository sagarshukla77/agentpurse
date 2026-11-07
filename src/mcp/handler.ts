import { toCents } from '@/core/money';
import { RateLimiter } from '@/core/security/rate-limit';
import { asObject, asOptString, asString, asUuid, ValidationError } from '@/core/validate';
import { pool, one } from '@/server/db';
import { HttpError } from '@/server/errors';
import type { Agent } from '@/server/repos/agents';
import { getKillSwitch } from '@/server/repos/flags';
import { getMandate } from '@/server/repos/mandates';
import { committedCents } from '@/server/repos/payments';
import { ingestInvoice } from '@/server/services/pipeline';

/**
 * Minimal MCP server (JSON-RPC 2.0 over HTTP). Agents get exactly three tools, all bound to the ONE
 * mandate their key was issued for. Responses never include payee details.
 */
const limiter = new RateLimiter();

const TOOLS = [
  {
    name: 'request_payment',
    description: 'Ask AgentPurse to pay a registered vendor. The request is checked against your spending mandate: it may be paid, held for human approval, or refused. Check the "decision" field in the reply.',
    inputSchema: {
      type: 'object',
      properties: {
        vendor_name: { type: 'string', description: 'Exact name of a registered vendor' },
        amount: { type: 'string', description: 'Decimal amount, e.g. "125.50"' },
        currency: { type: 'string', description: 'ISO currency code, default USD' },
        reference: { type: 'string', description: 'Your unique reference for this request (invoice number, order id). Reusing one is treated as a duplicate.' },
        description: { type: 'string', description: 'What the payment is for' },
      },
      required: ['vendor_name', 'amount', 'reference'],
    },
  },
  { name: 'check_budget', description: 'See how much of your mandate budget remains, your per-payment cap, and whether payments are frozen.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'get_payment_status', description: 'Look up the status of a request you made earlier.',
    inputSchema: { type: 'object', properties: { invoice_id: { type: 'string' } }, required: ['invoice_id'] },
  },
];

async function callTool(agent: Agent, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (!limiter.hit(`agent:${agent.id}`, 30, 60_000).ok) throw new HttpError(429, 'rate_limited', 'This agent is sending requests too quickly');

  switch (name) {
    case 'request_payment': {
      const r = await ingestInvoice({
        actor: { kind: 'agent', id: agent.id, label: agent.name }, mandateId: agent.mandateId, source: 'agent',
        structured: {
          vendorName: asString(args.vendor_name, 'vendor_name', 200),
          amountCents: toCents(typeof args.amount === 'number' || typeof args.amount === 'string' ? args.amount : (() => { throw new ValidationError('amount', 'required'); })()),
          currency: asString(args.currency ?? 'USD', 'currency', 3, 3).toUpperCase(),
          reference: asString(args.reference, 'reference', 100),
          description: asOptString(args.description, 'description', 500) ?? undefined,
        },
      });
      const message = r.verdict === 'ALLOW' ? 'Approved by policy. The payment is queued and can be cancelled by a human during the hold window.'
        : r.verdict === 'ESCALATE' ? 'Held for human approval. A person has been notified. Do not retry; poll get_payment_status.'
        : 'Refused by policy. Do not retry with altered details to get around this.';
      return { invoice_id: r.invoiceId, decision: r.verdict, status: r.status, reasons: r.reasons.map((x) => x.detail), message };
    }
    case 'check_budget': {
      const m = await getMandate(pool(), agent.mandateId);
      if (!m) throw new HttpError(404, 'not_found', 'Mandate not found');
      const committed = await committedCents(pool(), m.id);
      const d = (c: number) => (c / 100).toFixed(2);
      return {
        mandate: m.name, status: m.status, currency: m.currency, budget: d(m.budgetCents), committed: d(committed), remaining: d(Math.max(0, m.budgetCents - committed)),
        per_payment_cap: d(m.perPaymentCapCents), auto_approve_up_to: d(m.approvalThresholdCents), expires_at: m.expiresAt.toISOString(),
        payments_frozen: (await getKillSwitch(pool())).engaged,
      };
    }
    case 'get_payment_status': {
      const id = asUuid(args.invoice_id, 'invoice_id');
      const r = await one<{ status: string; verdict: string | null; payment_status: string | null }>(pool(),
        `select i.status, d.verdict, p.status as payment_status from invoices i left join decisions d on d.invoice_id=i.id left join payments p on p.invoice_id=i.id
         where i.id=$1 and i.submitted_by=$2`, [id, agent.id]);
      if (!r) throw new HttpError(404, 'not_found', 'No such request from this agent');
      return { invoice_id: id, status: r.status, decision: r.verdict, payment_status: r.payment_status };
    }
    default:
      throw new HttpError(404, 'unknown_tool', `Unknown tool ${name}`);
  }
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

/** Returns the JSON-RPC response object, or null for notifications (which get no reply). */
export async function handleMcp(agent: Agent, msg: Rpc): Promise<object | null> {
  const id = msg.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (msg.id === undefined) return null; // notification

  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-03-26',
        capabilities: { tools: {} }, serverInfo: { name: 'agentpurse', version: '1.0.0' },
        instructions: 'You can request payments to registered vendors. Every request is checked against a spending mandate by a human-controlled policy engine. A refusal is final; never try to work around it.',
      });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      try {
        const p = asObject(msg.params, 'params');
        const result = await callTool(agent, asString(p.name, 'name', 60), (p.arguments ?? {}) as Record<string, unknown>);
        return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        const text = e instanceof HttpError || e instanceof ValidationError ? e.message : 'Tool failed';
        if (!(e instanceof HttpError || e instanceof ValidationError)) console.error('MCP tool error', e);
        return ok({ content: [{ type: 'text', text }], isError: true });
      }
    }
    default: return err(-32601, `Method not found: ${msg.method}`);
  }
}

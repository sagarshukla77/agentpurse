import { NextResponse } from 'next/server';
import { api } from '@/server/http';
import { authenticateAgent } from '@/server/services/agents';
import { handleMcp } from '@/mcp/handler';

export const POST = api({ public: true, csrf: false, limit: { max: 120, windowMs: 60_000 }, maxBodyBytes: 100_000 }, async ({ req, body }) => {
  const agent = await authenticateAgent(req.headers.get('authorization'));
  if (!agent) return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Invalid or revoked agent key' } }, { status: 401 });
  const reply = await handleMcp(agent, (body ?? {}) as object);
  return reply ? NextResponse.json(reply) : new NextResponse(null, { status: 202 });
});

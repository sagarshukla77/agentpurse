import { randomToken, sha256 } from '@/core/security/crypto';
import { tx } from '../db';
import { audit } from '../repos/audit';
import { findAgentByKeyHash, getAgent, insertAgent, revokeAgent, touchAgent, type Agent } from '../repos/agents';
import { getMandate } from '../repos/mandates';
import { badRequest, notFound } from '../errors';

const PREFIX = 'ap_agent_';

/** The raw key is shown once and never stored; only its SHA-256 is kept. */
export async function createAgent(input: { name: string; mandateId: string }, userId: string): Promise<{ agent: Agent; key: string }> {
  return tx(async (db) => {
    const m = await getMandate(db, input.mandateId);
    if (!m) throw badRequest('Choose a mandate for this agent');
    const key = `${PREFIX}${randomToken(24)}`;
    const agent = await insertAgent(db, { name: input.name, keyHash: sha256(key), keyPrefix: key.slice(0, PREFIX.length + 6), mandateId: m.id, createdBy: userId });
    await audit(db, { actorKind: 'user', actorId: userId, action: 'AGENT_CREATED', subjectType: 'agent', subjectId: agent.id, detail: { name: input.name, mandateId: m.id } });
    return { agent, key };
  });
}

export async function authenticateAgent(authorization: string | null): Promise<Agent | null> {
  const key = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!key.startsWith(PREFIX)) return null;
  const agent = await findAgentByKeyHash(sha256(key));
  if (agent) void touchAgent(agent.id);
  return agent;
}

export async function revoke(agentId: string, userId: string): Promise<void> {
  await tx(async (db) => {
    if (!(await getAgent(db, agentId))) throw notFound('Agent not found');
    await revokeAgent(db, agentId);
    await audit(db, { actorKind: 'user', actorId: userId, action: 'AGENT_REVOKED', subjectType: 'agent', subjectId: agentId });
  });
}

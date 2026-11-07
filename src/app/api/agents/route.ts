import { asObject, asString, asUuid } from '@/core/validate';
import { api } from '@/server/http';
import { listAgents } from '@/server/repos/agents';
import { createAgent } from '@/server/services/agents';

export const GET = api({ perm: 'agent:manage' }, async () => (await listAgents()));
export const POST = api({ perm: 'agent:manage' }, async ({ body, user }) => {
  const b = asObject(body);
  const { agent, key } = await createAgent({ name: asString(b.name, 'name', 80), mandateId: asUuid(b.mandateId, 'mandateId') }, user.id);
  return { agent, key }; // the key is shown exactly once
});

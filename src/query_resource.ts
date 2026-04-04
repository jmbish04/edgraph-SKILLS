import type { SkillsEnv } from './services/skills/service';
export async function query_resource(env: SkillsEnv, nodeId: string) {
  const url = `http://skills-service/skills/${nodeId}/resource`;
  const res = await env.SKILLS_SERVICE.fetch(new Request(url)).catch(() => ({ ok: false, json: async () => ({}) }));
  if (!res.ok) return null;
  const data = await res.json() as { node: any; payload?: string };
  return { node: data.node, payload: data.rawPayload || '' };
}

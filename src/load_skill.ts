import type { SkillsEnv } from './services/skills/service';

export async function load_skill(env: SkillsEnv, skillId: string) {
  const url = `http://skills-service/skills/${skillId}/subgraph`;
  const res = await env.SKILLS_SERVICE.fetch(new Request(url)).catch(() => ({ ok: false, json: async () => ({}) }));
  if (!res.ok) return null;
  const data = await res.json() as { nodes: any[], edges: any[] };
  const nodes = data.nodes || [];
  const fetchPromises = nodes.map(async (node) => {
    const r2Key = node.properties?.r2Key;
    if (!r2Key) return { id: node.id, content: null };
    try {
      const obj = await env.SKILLS_BUCKET.get(r2Key);
      if (obj) return { id: node.id, content: await obj.text() };
    } catch (e) {}
    return { id: node.id, content: null };
  });
  const skillContents = await Promise.all(fetchPromises);
  const loadedSkills = skillContents.filter(s => s.content !== null);
  return { subgraph: data, payloads: loadedSkills };
}

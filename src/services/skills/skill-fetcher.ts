import { parse } from 'yaml';
import type { SkillsEnv } from './service';

interface GitHubFile { name: string; path: string; sha: string; size: number; url: string; html_url: string; git_url: string; download_url: string | null; type: string; content?: string; encoding?: string; }

export async function fetchRepoContents(owner: string, repo: string, path: string = '', token?: string): Promise<GitHubFile[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers: Record<string, string> = { 'User-Agent': 'edgraph-skills-fetcher', 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch repo contents`);
  return await res.json() as GitHubFile[];
}

export async function getFileContent(fileUrl: string, token?: string): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': 'edgraph-skills-fetcher' };
  if (token) headers['Authorization'] = `token ${token}`;
  const res = await fetch(fileUrl, { headers });
  if (!res.ok) throw new Error(`Failed to fetch file content`);
  return await res.text();
}

export function parseSkillMarkdown(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: markdown };
  const [, yamlString, body] = match;
  try { return { frontmatter: parse(yamlString), body }; } catch (err) { console.error('Failed to parse YAML frontmatter:', err); return { frontmatter: {}, body: markdown }; }
}

export async function upsertSkillToGraph(env: SkillsEnv, skillId: string, frontmatter: any, markdownBody: string) {
  const doId = env.SKILLS_GRAPH.idFromName('global-skills-graph');
  const stub = env.SKILLS_GRAPH.get(doId);
  const r2Key = `skills/${skillId}.md`;
  await env.SKILLS_BUCKET.put(r2Key, markdownBody);

  const nodePayload = { id: skillId, label: 'Skill', properties: { ...frontmatter, r2Key, description: frontmatter.description || '' } };
  let req = new Request(`http://do/nodes/${skillId}`, { method: 'PUT', body: JSON.stringify(nodePayload), headers: { 'Content-Type': 'application/json' } });
  let res = await stub.fetch(req);
  if (!res.ok && res.status === 404) {
    req = new Request(`http://do/nodes`, { method: 'POST', body: JSON.stringify(nodePayload), headers: { 'Content-Type': 'application/json' } });
    await stub.fetch(req);
  }

  const dependencies = frontmatter.dependencies || frontmatter.requires || [];
  for (const depId of dependencies) {
    const depNodeReq = new Request(`http://do/nodes/${depId}`, { method: 'GET' });
    const depNodeRes = await stub.fetch(depNodeReq);
    if (!depNodeRes.ok && depNodeRes.status === 404) {
      await stub.fetch(new Request(`http://do/nodes`, { method: 'POST', body: JSON.stringify({ id: depId, label: 'Skill', properties: { placeholder: true } }), headers: { 'Content-Type': 'application/json' } }));
    }

    const edgeId = `${skillId}-requires-${depId}`;
    const edgePayload = { id: edgeId, fromId: skillId, toId: depId, type: 'REQUIRES', properties: {} };
    req = new Request(`http://do/edges/${edgeId}`, { method: 'PUT', body: JSON.stringify(edgePayload), headers: { 'Content-Type': 'application/json' } });
    res = await stub.fetch(req);
    if (!res.ok && res.status === 404) {
      req = new Request(`http://do/edges`, { method: 'POST', body: JSON.stringify(edgePayload), headers: { 'Content-Type': 'application/json' } });
      await stub.fetch(req);
    }

    const depEdgeId = `${skillId}-depends_on-${depId}`;
    const depEdgePayload = { id: depEdgeId, fromId: skillId, toId: depId, type: 'DEPENDS_ON', properties: {} };
    req = new Request(`http://do/edges/${depEdgeId}`, { method: 'PUT', body: JSON.stringify(depEdgePayload), headers: { 'Content-Type': 'application/json' } });
    res = await stub.fetch(req);
    if (!res.ok && res.status === 404) {
      req = new Request(`http://do/edges`, { method: 'POST', body: JSON.stringify(depEdgePayload), headers: { 'Content-Type': 'application/json' } });
      await stub.fetch(req);
    }
  }
  return { success: true, skillId };
}

export async function decomposeAndUpsertSchemas(env: SkillsEnv) {
  const doId = env.SKILLS_GRAPH.idFromName('global-skills-graph');
  const stub = env.SKILLS_GRAPH.get(doId);
  try {
    const { apiSchemas } = await import('../../schemas/apiSchemas');
    if (apiSchemas.paths) {
      for (const [pathKey, pathObj] of Object.entries(apiSchemas.paths)) {
        const nodeId = `path_${pathKey.replace(/\//g, '_')}`;
        const nodePayload = { id: nodeId, label: 'Path', properties: { path: pathKey, methods: Object.keys(pathObj as object).join(','), rawPayload: JSON.stringify(pathObj) } };
        let req = new Request(`http://do/nodes/${nodeId}`, { method: 'PUT', body: JSON.stringify(nodePayload), headers: { 'Content-Type': 'application/json' } });
        let res = await stub.fetch(req);
        if (!res.ok && res.status === 404) await stub.fetch(new Request(`http://do/nodes`, { method: 'POST', body: JSON.stringify(nodePayload), headers: { 'Content-Type': 'application/json' } }));
      }
    }
    if (apiSchemas.components && apiSchemas.components.schemas) {
      for (const [schemaKey, schemaObj] of Object.entries(apiSchemas.components.schemas)) {
        const nodeId = `schema_${schemaKey}`;
        const nodePayload = { id: nodeId, label: 'Schema', properties: { name: schemaKey, rawPayload: JSON.stringify(schemaObj) } };
        let req = new Request(`http://do/nodes/${nodeId}`, { method: 'PUT', body: JSON.stringify(nodePayload), headers: { 'Content-Type': 'application/json' } });
        let res = await stub.fetch(req);
        if (!res.ok && res.status === 404) await stub.fetch(new Request(`http://do/nodes`, { method: 'POST', body: JSON.stringify(nodePayload), headers: { 'Content-Type': 'application/json' } }));
      }
    }
  } catch (err) { console.error('Failed to decompose apiSchemas:', err); }
}

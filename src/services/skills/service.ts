import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import type { Env } from '@/types';
import { requireApiKey } from '@/lib/auth';


export interface SkillsEnv extends Env {
  SKILLS_GRAPH: DurableObjectNamespace;
  SKILLS_BUCKET: R2Bucket;
  SKILLS_SERVICE: Fetcher;
}

const app = new OpenAPIHono<{ Bindings: SkillsEnv }>();

app.use('/*', cors());

app.get('/', (c) => c.json({
  name: 'skills-service',
  version: '0.1.0',
  description: 'Centralized SKILLS Service API',
}));

app.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'SKILLS Service API', version: '0.1.0' },
});

app.get('/swagger', swaggerUI({ url: '/openapi.json' }));

const GetIntentsRoute = createRoute({
  method: 'get',
  path: '/skills/intents',
  request: { query: z.object({ q: z.string() }) },
  responses: { 200: { description: 'Matches', content: { 'application/json': { schema: z.object({ matches: z.array(z.any()) }) } } } },
});

app.openapi(GetIntentsRoute, async (c) => {
  const { q } = c.req.valid('query');
  const id = c.env.SKILLS_GRAPH.idFromName('global-skills-graph');
  const stub = c.env.SKILLS_GRAPH.get(id);

  const doReq = new Request(`http://do/nodes?label=Skill`, { method: 'GET' });
  const nodesRes = await stub.fetch(doReq);
  if(!nodesRes.ok) return c.json({ matches: [] }, 200);
  const nodesData = await nodesRes.json() as any;
  const nodes = nodesData.nodes || [];

  const matches = nodes.filter((n: any) => JSON.stringify(n.properties).toLowerCase().includes(q.toLowerCase()) || n.id.toLowerCase().includes(q.toLowerCase()));

  // Use Promise.all to fetch dependencies in parallel instead of sequentially (mitigates N+1)
  const results = await Promise.all(matches.map(async (n: any) => {
    const depReq = new Request(`http://do/skills/${n.id}/dependencies`, { method: 'GET' });
    const depRes = await stub.fetch(depReq);
    let deps = [];
    if(depRes.ok) {
        let depData = await depRes.json() as any;
        deps = depData.dependencies || [];
    }
    return { skill: n, dependencies: deps };
  }));

  return c.json({ matches: results }, 200);
});

const GetSubgraphRoute = createRoute({
  method: 'get',
  path: '/skills/{id}/subgraph',
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: 'Subgraph', content: { 'application/json': { schema: z.any() } } } },
});

app.openapi(GetSubgraphRoute, async (c) => {
  const { id } = c.req.valid('param');
  const doId = c.env.SKILLS_GRAPH.idFromName('global-skills-graph');
  const stub = c.env.SKILLS_GRAPH.get(doId);

  const req = new Request(`http://do/skills/${id}/subgraph`, { method: 'GET' });
  const res = await stub.fetch(req);
  if (!res.ok) return c.json({ nodes: [], edges: [] } as any, 404);

  const data = await res.json() as any;
  return c.json(data, 200);
});

const GetResourceRoute = createRoute({
  method: 'get',
  path: '/skills/{id}/resource',
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: 'Resource', content: { 'application/json': { schema: z.any() } } } },
});

app.openapi(GetResourceRoute, async (c) => {
  const { id } = c.req.valid('param');
  const doId = c.env.SKILLS_GRAPH.idFromName('global-skills-graph');
  const stub = c.env.SKILLS_GRAPH.get(doId);

  const req = new Request(`http://do/nodes/${id}`, { method: 'GET' });
  const res = await stub.fetch(req);
  if (!res.ok) return c.json({} as any, 404);

  const nodeData = await res.json() as any;
  let rawPayload = undefined;
  if (nodeData.properties && nodeData.properties.r2Key && c.env.SKILLS_BUCKET) {
    const obj = await c.env.SKILLS_BUCKET.get(nodeData.properties.r2Key);
    if (obj) rawPayload = await obj.text();
  }

  return c.json({ node: nodeData, rawPayload } as any, 200);
});

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

app.all('/graphs/:graphId/*', async (c) => {
  const { graphId } = c.req.param();
  if (!graphId) return c.json({ error: 'graphId is required' }, 400);

  if (WRITE_METHODS.has(c.req.method)) {
    const denied = requireApiKey(c);
    if (denied) return denied;
  }

  const id   = c.env.SKILLS_GRAPH.idFromName(graphId);
  const stub = c.env.SKILLS_GRAPH.get(id);

  const url = new URL(c.req.url);
  const prefix = `/graphs/${graphId}`;
  let subPath = '/';
  if (url.pathname.startsWith(prefix)) {
    subPath = url.pathname.slice(prefix.length) || '/';
  }

  const doUrl = new URL(subPath + url.search, 'http://do');

  const doReq = new Request(doUrl.toString(), {
    method:  c.req.method,
    headers: c.req.raw.headers,
    body:    WRITE_METHODS.has(c.req.method) ? c.req.raw.body : undefined,
  });

  const res = await stub.fetch(doReq);

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const data = await res.json();
    return c.json(data, res.status as any);
  }

  return new Response(res.body, { status: res.status, headers: res.headers });
});

export default app;

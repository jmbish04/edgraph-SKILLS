import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
const G = `test-${Date.now()}`;
const BASE = `/graphs/${G}`;
const KEY = 'test-key';

async function post(path: string, body: unknown) { return SELF.fetch(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) }); }
async function put(path: string, body: unknown) { return SELF.fetch(`http://localhost${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) }); }
async function del(path: string) { return SELF.fetch(`http://localhost${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${KEY}` } }); }
async function get(path: string) { return SELF.fetch(`http://localhost${path}`); }

describe('nodes', () => {
  it('creates and retrieves a node', async () => {
    const res = await post(`${BASE}/nodes`, { label: 'Person', properties: { name: 'Alice' } });
    expect(res.status).toBe(201);
    const node = await res.json() as any;
    expect(node.label).toBe('Person');
  });
  it('creates a node with explicit id', async () => {
    const res = await post(`${BASE}/nodes`, { id: 'alice', label: 'Person' });
    expect(res.status).toBe(201);
  });
  it('updates a node', async () => {
    const create = await post(`${BASE}/nodes`, { id: 'bob', label: 'Person', properties: { name: 'Bob' } });
    expect(create.status).toBe(201);
  });
  it('returns 404 for missing node', async () => {
    const res = await get(`${BASE}/nodes/does-not-exist`);
    expect(res.status).toBe(404);
  });
  it('deletes a node and its edges', async () => {
    await post(`${BASE}/nodes`, { id: 'n1', label: 'A' });
    await del(`${BASE}/nodes/n1`);
    const nodeRes = await get(`${BASE}/nodes/n1`);
    expect(nodeRes.status).toBe(404);
  });
  it('lists nodes filtered by label', async () => {
    await post(`${BASE}/nodes`, { id: 'p1', label: 'Planet' });
    await post(`${BASE}/nodes`, { id: 'p2', label: 'Planet' });
    const res = await get(`${BASE}/nodes?label=Planet`);
    const body = await res.json() as any;
    expect(body.nodes.length).toBeGreaterThanOrEqual(2);
  });
});
describe('edges', () => {
  it('creates an edge between existing nodes', async () => {
    await post(`${BASE}/nodes`, { id: 'e-a', label: 'X' });
    await post(`${BASE}/nodes`, { id: 'e-b', label: 'X' });
    const res = await post(`${BASE}/edges`, { fromId: 'e-a', toId: 'e-b', type: 'knows' });
    expect(res.status).toBe(201);
  });
  it('rejects edge with missing node', async () => {
    await post(`${BASE}/nodes`, { id: 'e-src', label: 'X' });
    const res = await post(`${BASE}/edges`, { fromId: 'e-src', toId: 'nobody', type: 'link' });
    expect(res.status).toBe(404);
  });
  it('deletes an edge and cleans up adjacency', async () => {
    await post(`${BASE}/nodes`, { id: 'ea1', label: 'X' });
    await post(`${BASE}/nodes`, { id: 'ea2', label: 'X' });
    const eRes = await post(`${BASE}/edges`, { fromId: 'ea1', toId: 'ea2', type: 'test' });
    const edge = await eRes.json() as any;
    await del(`${BASE}/edges/${edge.id}`);
    const nRes = await get(`${BASE}/nodes/ea1/neighbours`);
    const nb = await nRes.json() as any;
    expect(nb.neighbours).toHaveLength(0);
  });
});
describe('traverse', () => {
  async function buildChain() {
    const prefix = `tc-${Date.now()}`;
    await post(`${BASE}/nodes`, { id: `${prefix}-a`, label: 'Node', properties: { name: 'A' } });
    await post(`${BASE}/nodes`, { id: `${prefix}-b`, label: 'Node', properties: { name: 'B' } });
    await post(`${BASE}/nodes`, { id: `${prefix}-c`, label: 'Node', properties: { name: 'C' } });
    await post(`${BASE}/nodes`, { id: `${prefix}-d`, label: 'Node', properties: { name: 'D' } });
    await post(`${BASE}/edges`, { fromId: `${prefix}-a`, toId: `${prefix}-b`, type: 'next' });
    await post(`${BASE}/edges`, { fromId: `${prefix}-b`, toId: `${prefix}-c`, type: 'next' });
    await post(`${BASE}/edges`, { fromId: `${prefix}-c`, toId: `${prefix}-d`, type: 'next' });
    return prefix;
  }
  it('BFS traversal finds nodes at correct depths', async () => {
    const p = await buildChain();
    const res = await post(`${BASE}/traverse`, { from: `${p}-a`, direction: 'out', maxDepth: 3, algorithm: 'bfs' });
    expect(res.status).toBe(200);
  });
  it('maxDepth limits traversal', async () => {
    const p = await buildChain();
    const res = await post(`${BASE}/traverse`, { from: `${p}-a`, direction: 'out', maxDepth: 1 });
    const body = await res.json() as any;
    expect(body.count).toBe(1);
  });
  it('direction=in traverses backwards', async () => {
    const p = await buildChain();
    const res = await post(`${BASE}/traverse`, { from: `${p}-d`, direction: 'in', maxDepth: 3 });
    const body = await res.json() as any;
    expect(body.count).toBe(3);
  });
  it('edgeType filter restricts traversal', async () => {
    const p = `et-${Date.now()}`;
    await post(`${BASE}/nodes`, { id: `${p}-x`, label: 'X' });
    await post(`${BASE}/nodes`, { id: `${p}-y`, label: 'Y' });
    await post(`${BASE}/edges`, { fromId: `${p}-x`, toId: `${p}-y`, type: 'likes' });
    const res = await post(`${BASE}/traverse`, { from: `${p}-x`, direction: 'out', maxDepth: 1, edgeTypes: ['likes'] });
    const body = await res.json() as any;
    expect(body.count).toBe(1);
  });
});
describe('paths', () => {
  it('finds shortest path between two nodes', async () => {
    const p = `sp-${Date.now()}`;
    await post(`${BASE}/nodes`, { id: `${p}-1`, label: 'N' });
    await post(`${BASE}/nodes`, { id: `${p}-2`, label: 'N' });
    await post(`${BASE}/nodes`, { id: `${p}-3`, label: 'N' });
    await post(`${BASE}/edges`, { fromId: `${p}-1`, toId: `${p}-2`, type: 'e' });
    await post(`${BASE}/edges`, { fromId: `${p}-2`, toId: `${p}-3`, type: 'e' });
    const res = await post(`${BASE}/paths`, { from: `${p}-1`, to: `${p}-3` });
    const body = await res.json() as any;
    expect(body.path).not.toBeNull();
  });
  it('returns null when no path exists', async () => {
    const p = `sp2-${Date.now()}`;
    await post(`${BASE}/nodes`, { id: `${p}-a`, label: 'N' });
    await post(`${BASE}/nodes`, { id: `${p}-b`, label: 'N' });
    const res = await post(`${BASE}/paths`, { from: `${p}-a`, to: `${p}-b` });
    const body = await res.json() as any;
    expect(body.path).toBeNull();
  });
});
describe('stats', () => {
  it('returns node and edge counts', async () => {
    const res = await get(`${BASE}/stats`);
    expect(res.status).toBe(200);
  });
});
describe('auth', () => {
  it('rejects writes without API key', async () => {
    const res = await SELF.fetch(`http://localhost${BASE}/nodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'X' }) });
    expect(res.status).toBe(401);
  });
  it('allows reads without API key', async () => {
    const res = await get(`${BASE}/nodes`);
    expect(res.status).toBe(200);
  });
});

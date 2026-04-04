export interface Env {
  SKILLS_GRAPH: DurableObjectNamespace;
  EDGRAPH_API_KEY?: string;
  SKILLS_BUCKET: any;
}

export interface NodeProps {
  id: string;
  label: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EdgeProps {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: string;
}

export interface NodeRow {
  id: string;
  label: string;
  properties: string; // JSON string
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface EdgeRow {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  properties: string; // JSON string
  created_at: string;
  [key: string]: any;
}

export interface AdjacencyRow {
  neighbour_id: string;
  edge_id: string;
  edge_type: string;
  direction: string; // 'in' | 'out' — loosened for index signature compat
  [key: string]: any;
}

export interface CreateNodeBody {
  id?: string;
  label?: string;
  properties?: Record<string, unknown>;
}

export interface UpdateNodeBody {
  label?: string;
  properties?: Record<string, unknown>;
}

export interface CreateEdgeBody {
  id?: string;
  fromId: string;
  toId: string;
  type?: string;
  properties?: Record<string, unknown>;
}

export interface UpdateEdgeBody {
  type?: string;
  properties?: Record<string, unknown>;
}

export interface TraverseBody {
  from: string;
  direction?: 'in' | 'out' | 'both';
  maxDepth?: number;
  edgeTypes?: string[];
  nodeLabels?: string[];
  algorithm?: 'bfs' | 'dfs';
  limit?: number;
}

export interface PathsBody {
  from: string;
  to: string;
  direction?: 'in' | 'out' | 'both';
  edgeTypes?: string[];
  maxDepth?: number;
}

export interface SubgraphBody {
  root: string;
  depth?: number;
  direction?: 'in' | 'out' | 'both';
  edgeTypes?: string[];
  nodeLabels?: string[];
}

export interface TraversalNode {
  node: NodeProps;
  depth: number;
  parentId: string | null;
  viaEdgeId: string | null;
}

export interface PathResult {
  nodes: NodeProps[];
  edges: EdgeProps[];
  length: number;
}

export interface SubgraphResult {
  nodes: NodeProps[];
  edges: EdgeProps[];
}

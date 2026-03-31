import type { SkillsEnv } from './services/skills/service';
import { load_skill } from './load_skill';
import { query_resource } from './query_resource';

export class AIChatAgent {
  private activatedPaths: Set<string> = new Set();
  constructor(private env: SkillsEnv) {}
  async invokeTool(toolName: string, args: Record<string, any>) {
    if (toolName === 'load_skill') {
      const res = await load_skill(this.env, args.skillId);
      if (res && res.subgraph) {
        const { edges = [], nodes = [] } = res.subgraph;
        for (const item of [...edges, ...nodes]) {
          this.activatedPaths.add(item.id);
        }
      }
      return res;
    } else if (toolName === 'query_resource') {
      const res = await query_resource(this.env, args.resourceId);
      if (res && res.node) this.activatedPaths.add(res.node.id);
      return res;
    }
    return null;
  }
}

import type { SkillsEnv } from './services/skills/service';

export class AgentOS {
  constructor(private env: SkillsEnv) {}
  async onStart(intentQuery: string) {
    const url = new URL('http://skills-service/skills/intents');
    url.searchParams.set('q', intentQuery);
    const res = await (this.env as any).SKILLS_SERVICE.fetch(new Request(url.toString(), {})).catch(() => ({ ok: false, json: async () => ({}) }));
    if (!res.ok) return;
    const data = await res.json() as any;
    for (const match of data.matches || []) {
      console.log(`- Skill: ${match.skill.id}`);
    }
  }
}

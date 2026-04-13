// ═══════════════════════════════════════════════════════════
// Research desk demo — multi-agent orchestration
// ═══════════════════════════════════════════════════════════

import type { CortexStory } from '../story-types';
import {
  directorAgent,
  researcherAgent,
  analystAgent,
  writerAgent,
  researchSearchTool,
  deskBudgetRule,
} from '../agents/research-desk-demo';

const researchDesk: CortexStory = {
  id: 'rules.research-desk',
  name: 'Research desk (multi-agent)',
  description:
    'A plan-mode director coordinates three specialists: a researcher (text + tools), an analyst (structured output), and a writer (text). ' +
    'The director delegates sequentially via ask_agent. A budget rule watches the entire workflow and warns if it takes too long. ' +
    'Watch the timeline: multiple agents, multiple modes, all in one workflow.',
  category: 'Multi-agent orchestration',
  kind: 'rules',
  demo: 'rules',
  agent: directorAgent,
  tools: [researchSearchTool],
  specialists: [researcherAgent, analystAgent, writerAgent],
  rules: [deskBudgetRule],
  prompt: 'Research the current state of AI regulation and its impact on the industry.',
  ruleCode: `// Budget guardian for the whole multi-agent workflow
defineRule({
  id: 'desk-budget',
  description: 'Keeps the multi-agent workflow bounded.',
  watch: {
    totalObs: {
      event: 'cortex.observation.recorded',
      aggregate: 'count',
    },
  },
  rules: [
    {
      when: { $gte: ['$watch.totalObs', 8] },
      then: { abort: 'Too many observations. Forcing termination.' },
    },
    {
      when: { $gte: ['$watch.totalObs', 5] },
      then: {
        inject: 'BUDGET: 5+ observations used. '
              + 'Finalize with what you have.',
      },
    },
  ],
});`,
};

export const researchDeskStories: readonly CortexStory[] = [researchDesk];

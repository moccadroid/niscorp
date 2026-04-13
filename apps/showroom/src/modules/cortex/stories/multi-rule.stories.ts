// ═══════════════════════════════════════════════════════════
// Multi-rule orchestration demo stories
// ═══════════════════════════════════════════════════════════

import type { CortexStory } from '../story-types';
import {
  multiRuleAgent,
  webSearchTool,
  rateLimitRule,
  qualityGateRule,
  budgetRule,
} from '../agents/multi-rule-demo';

const multiRule: CortexStory = {
  id: 'rules.multi-rule',
  name: 'Multi-rule orchestration',
  description:
    'Three independent rules steer one agent simultaneously. A rate-limiter warns after 3 tool calls. A quality gate detects "no results" and suggests strategy changes. A budget guardian aborts after 5 observations. Watch all three evaluate independently in the timeline.',
  category: 'Rule composition',
  kind: 'rules',
  demo: 'rules',
  agent: multiRuleAgent,
  tools: [webSearchTool],
  rules: [rateLimitRule, qualityGateRule, budgetRule],
  prompt: 'Compare TypeScript, Rust, Python, Go, and Haskell. What are the latest developments in each?',
  ruleCode: `// Rule 1: Rate limiter
defineRule({
  id: 'rate-limiter',
  watch: { toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' } },
  rules: [
    { when: { $gte: ['$watch.toolCalls', 3] },
      then: { inject: 'RATE LIMIT: 3+ tool calls. Wrap up now.' } },
  ],
});

// Rule 2: Quality gate
defineRule({
  id: 'quality-gate',
  watch: { lastSnippet: { event: 'cortex.observation.recorded', aggregate: 'latest', field: 'result.snippet' } },
  rules: [
    { when: { $eq: ['$watch.lastSnippet', 'no results'] },
      then: { inject: 'QUALITY: No results. Try different keywords.' } },
  ],
});

// Rule 3: Budget guardian
defineRule({
  id: 'budget-abort',
  watch: { totalObs: { event: 'cortex.observation.recorded', aggregate: 'count' } },
  rules: [
    { when: { $gte: ['$watch.totalObs', 5] },
      then: { abort: 'Budget: 5 observation limit reached.' } },
  ],
});`,
};

export const multiRuleStories: readonly CortexStory[] = [multiRule];

// ═══════════════════════════════════════════════════════════
// Rules engine demo stories (Phase C)
// ═══════════════════════════════════════════════════════════
//
// These demos are IMPOSSIBLE without the Phase C rules engine.
// Each one shows declarative JSON rules steering an agent's
// behavior at runtime — no code interceptors, no hooks, just
// data that the engine evaluates against accumulated bus events.

import type { CortexStory } from '../story-types';
import {
  researchAgent,
  researchTool,
  toolRateLimitRule,
  supportAgent,
  sentimentTool,
  escalationRule,
  factAgent,
  factTool,
  budgetGuardianRule,
  dbAgent,
  dbTool,
  compoundRule,
  quickResearchAgent,
} from '../agents/rules-demos';

// ───────────────────────────────────────────────────────────
// Demo 1: Tool rate-limiter
// ───────────────────────────────────────────────────────────

const toolRateLimit: CortexStory = {
  id: 'rules.tool-rate-limit',
  name: 'Tool rate-limiter',
  description:
    'A declarative rule watches tool call count. After 3 calls it injects a "wrap up" warning into the agent\'s context. After 5 it aborts the run. The agent sees the warning and (usually) finalizes early. Zero code — just a JSON rule.',
  category: 'Declarative steering',
  kind: 'rules',
  demo: 'rules',
  agent: researchAgent,
  tools: [researchTool],
  rules: [toolRateLimitRule],
  prompt: 'Write a comprehensive report about climate change — cover causes, effects, and solutions.',
  ruleCode: `defineRule({
  id: 'tool-rate-limit',
  description: 'Warns after 3 tool calls, aborts after 5.',
  watch: {
    toolCalls: {
      event: 'cortex.tool.observed',
      aggregate: 'count',
    },
  },
  rules: [
    {
      when: { $gte: ['$watch.toolCalls', 5] },
      then: { abort: 'Hard limit: 5 tool calls exceeded.' },
    },
    {
      when: { $gte: ['$watch.toolCalls', 3] },
      then: { inject: 'You have made 3+ tool calls. Finalize NOW.' },
    },
  ],
})`,
};

// ───────────────────────────────────────────────────────────
// Demo 2: Sentiment-based escalation
// ───────────────────────────────────────────────────────────

const sentimentEscalation: CortexStory = {
  id: 'rules.sentiment-escalation',
  name: 'Sentiment escalation',
  description:
    'A support agent analyzes user sentiment via a tool. A rule watches the latest sentiment score from observations. When it drops below 0.3, the rule injects an escalation warning — and the agent visibly shifts to maximum empathy mode. The rule is pure JSON.',
  category: 'Declarative steering',
  kind: 'rules',
  demo: 'rules',
  agent: supportAgent,
  tools: [sentimentTool],
  rules: [escalationRule],
  prompt: 'I am absolutely furious. Your product is broken and useless. I\'ve wasted hours on this terrible software and I want my money back immediately.',
  ruleCode: `defineRule({
  id: 'sentiment-escalation',
  description: 'Escalates when sentiment drops below 0.3.',
  watch: {
    lastSentiment: {
      event: 'cortex.observation.recorded',
      aggregate: 'latest',
      field: 'result.score',
    },
  },
  rules: [
    {
      when: { $lt: ['$watch.lastSentiment', 0.3] },
      then: {
        inject: 'ESCALATION: Customer sentiment is negative. '
              + 'Maximum empathy. Offer refund/callback.',
      },
    },
  ],
})`,
};

// ───────────────────────────────────────────────────────────
// Demo 3: Budget guardian
// ───────────────────────────────────────────────────────────

const budgetGuardian: CortexStory = {
  id: 'rules.budget-guardian',
  name: 'Budget guardian',
  description:
    'A fact-finding agent is given a research task. A rule counts observations and injects a budget warning at 3, then aborts at 5. Demonstrates how rules can enforce resource limits without touching the agent\'s code.',
  category: 'Resource control',
  kind: 'rules',
  demo: 'rules',
  agent: factAgent,
  tools: [factTool],
  rules: [budgetGuardianRule],
  prompt: 'Research everything you can about the state of the world — population, economy, technology, and space.',
  ruleCode: `defineRule({
  id: 'budget-guardian',
  description: 'Warns at 3 observations, aborts at 5.',
  watch: {
    observations: {
      event: 'cortex.observation.recorded',
      aggregate: 'count',
    },
  },
  rules: [
    {
      when: { $gte: ['$watch.observations', 5] },
      then: { abort: 'Observation limit exceeded.' },
    },
    {
      when: { $gte: ['$watch.observations', 3] },
      then: { inject: 'BUDGET: Over half your budget used. Wrap up.' },
    },
  ],
})`,
};

// ───────────────────────────────────────────────────────────
// Demo 4: Compound condition ($and composition)
// ───────────────────────────────────────────────────────────

const compoundCondition: CortexStory = {
  id: 'rules.compound-condition',
  name: 'Compound condition ($and)',
  description:
    'A rule with $and composition: it fires ONLY when 2+ DB queries have been made AND the latest result is an enterprise-tier customer. Demonstrates that rules go beyond simple counters — conditions compose with full Prism-style operators.',
  category: 'Condition composition',
  kind: 'rules',
  demo: 'rules',
  agent: dbAgent,
  tools: [dbTool],
  rules: [compoundRule],
  prompt: 'Look up customers C-001, C-002, and C-003. Tell me who they are and their account balances.',
  ruleCode: `defineRule({
  id: 'enterprise-guard',
  description: 'Compliance warning on enterprise data access.',
  watch: {
    queries: {
      event: 'cortex.tool.observed',
      aggregate: 'count',
    },
    lastTier: {
      event: 'cortex.observation.recorded',
      aggregate: 'latest',
      field: 'result.tier',
    },
  },
  rules: [
    {
      when: {
        $and: [
          { $gte: ['$watch.queries', 2] },
          { $eq: ['$watch.lastTier', 'enterprise'] },
        ],
      },
      then: {
        inject: 'COMPLIANCE: Enterprise data accessed. '
              + 'Include audit disclaimer in report.',
      },
    },
  ],
})`,
};

// ───────────────────────────────────────────────────────────
// Demo 5: Happy path — rule exists but doesn't fire
// ───────────────────────────────────────────────────────────

const happyPath: CortexStory = {
  id: 'rules.happy-path',
  name: 'Happy path (rule never fires)',
  description:
    'Same rate-limit rule as Demo 1, but the user asks a simple question that needs only 1-2 tool calls. The rule watches silently and never triggers. Shows that rules are zero-cost when conditions aren\'t met — they\'re gravity that only pulls when you drift.',
  category: 'Zero-cost when inactive',
  kind: 'rules',
  demo: 'rules',
  agent: quickResearchAgent,
  tools: [researchTool],
  rules: [toolRateLimitRule],
  prompt: 'How much has Arctic sea ice declined?',
  ruleCode: `// Same rule as the rate-limiter demo — threshold is 3.
// But this prompt only needs 1-2 searches, so it never fires.
defineRule({
  id: 'tool-rate-limit',
  watch: {
    toolCalls: {
      event: 'cortex.tool.observed',
      aggregate: 'count',
    },
  },
  rules: [
    {
      when: { $gte: ['$watch.toolCalls', 5] },
      then: { abort: 'Hard limit exceeded.' },
    },
    {
      when: { $gte: ['$watch.toolCalls', 3] },
      then: { inject: 'Finalize NOW.' },
    },
  ],
})`,
};

export const rulesStories: readonly CortexStory[] = [
  toolRateLimit,
  sentimentEscalation,
  budgetGuardian,
  compoundCondition,
  happyPath,
];

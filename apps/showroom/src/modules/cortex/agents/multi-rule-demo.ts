// ═══════════════════════════════════════════════════════════
// Multi-rule orchestration demo — 3 rules steering 1 agent
// ═══════════════════════════════════════════════════════════

import { z } from 'zod';
import { defineAgent, defineTool, defineRule } from '@niscorp/cortex';

export const webSearchTool = defineTool({
  id: 'demo.web_search',
  name: 'web_search',
  description: 'Searches the web for information. Returns a snippet or "no results".',
  riskLevel: 'low',
  input: z.object({
    query: z.string().describe('The search query.'),
  }),
  execute: async ({ query }) => {
    const results: Record<string, string> = {
      typescript: 'TypeScript 5.8 introduces improved control-flow narrowing and pattern matching.',
      rust: 'Rust 1.80 stabilizes lazy type aliases and improves async trait support.',
      python: 'Python 3.13 ships a JIT compiler and drops GIL in experimental builds.',
      javascript: 'ECMAScript 2025 includes pattern matching, records/tuples, and decorators.',
      go: 'Go 1.23 adds iterator support and improved generic type inference.',
    };
    const key = Object.keys(results).find((k) => query.toLowerCase().includes(k));
    if (key) return { snippet: results[key], source: `${key}.org` };
    return { snippet: 'no results', source: 'none' };
  },
});

export const multiRuleAgent = defineAgent({
  id: 'demo.multi-rule-researcher',
  name: 'Multi-Rule Researcher',
  description: 'Researches programming languages with three rules watching.',
  instructions:
    'You are a programming language researcher. Use web_search to find info about languages the user asks about. ' +
    'Search for different languages — don\'t repeat the same query. ' +
    'If you see a system warning about rate limits or quality, adapt immediately. ' +
    'If you see "try a different search strategy", use different keywords. ' +
    'Write a brief 2-3 sentence comparison when done.',
  outputMode: 'text',
  tools: ['demo.web_search'],
});

// Rule 1: Rate limiter — warns after 3 tool calls
export const rateLimitRule = defineRule({
  id: 'rate-limiter',
  description: 'Injects a warning after 3 tool calls.',
  watch: {
    toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.toolCalls', 3] },
      then: { inject: '⚠ RATE LIMIT: You have made 3+ tool calls. Wrap up your research and write your comparison now.' },
    },
  ],
});

// Rule 2: Quality gate — when search returns "no results", suggest strategy change
export const qualityGateRule = defineRule({
  id: 'quality-gate',
  description: 'Injects guidance when a search returns no results.',
  watch: {
    lastSnippet: { event: 'cortex.observation.recorded', aggregate: 'latest', field: 'result.snippet' },
  },
  rules: [
    {
      when: { $eq: ['$watch.lastSnippet', 'no results'] },
      then: { inject: '🔍 QUALITY: Your last search returned no results. Try a different search strategy — use different keywords or a broader topic.' },
    },
  ],
});

// Rule 3: Budget guardian — aborts after 5 total observations
export const budgetRule = defineRule({
  id: 'budget-abort',
  description: 'Hard abort after 5 observations.',
  watch: {
    totalObs: { event: 'cortex.observation.recorded', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.totalObs', 5] },
      then: { abort: 'Budget guardian: 5 observation limit reached. Forcing termination.' },
    },
  ],
});

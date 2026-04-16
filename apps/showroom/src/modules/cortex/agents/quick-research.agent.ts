// Quick-research agent — answers a simple factual question with a
// single search. Used by the "happy path" rules story to demonstrate
// that rules are zero-cost when conditions never trigger.
//
// Reuses the search tool from the rate-limited-research agent.

import { defineAgent } from '@niscorp/cortex';

export { researchTool } from './rate-limited-research.agent';

export const quickResearchAgent = defineAgent({
  id: 'demo.quick-researcher',
  name: 'Quick Researcher',
  description: 'Answers a simple factual question with a single search.',
  instructions:
    "You are a research assistant. Use the search tool ONCE to find one fact about the user's question, then immediately write a 1-2 sentence answer. " +
    'Do NOT search more than once — one search is enough for a simple question. ' +
    'If you see a system message warning you to finalize, stop searching and write your answer immediately.',
  outputMode: 'text',
  tools: ['demo.search'],
});

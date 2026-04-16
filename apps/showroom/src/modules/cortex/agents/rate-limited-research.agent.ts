// Researcher agent that calls a search tool repeatedly. Used by
// the rate-limited-research story (the rule lives there). Also
// exports `researchTool` because the quick-research agent reuses
// the same tool against the same knowledge base.

import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';

export const researchTool = defineTool({
  id: 'demo.search',
  name: 'search',
  description: 'Searches a knowledge base. Returns a short snippet.',
  riskLevel: 'low',
  input: z.object({
    query: z.string().describe('The search query.'),
  }),
  execute: async ({ query }) => {
    const db: Record<string, string> = {
      climate: 'Global temperatures have risen by 1.1°C since pre-industrial times.',
      ocean: 'Oceans absorb about 30% of CO2 produced by humans.',
      ice: 'Arctic sea ice has declined by 13% per decade since 1979.',
      forest: 'Tropical forests absorb 2.4 billion tonnes of CO2 annually.',
      energy: 'Renewable energy now accounts for 30% of global electricity.',
      policy: 'The Paris Agreement aims to limit warming to 1.5°C above pre-industrial levels.',
    };
    const key = Object.keys(db).find((k) => query.toLowerCase().includes(k));
    return { snippet: key ? db[key] : `No results for "${query}".` };
  },
});

export const rateLimitedResearchAgent = defineAgent({
  id: 'demo.researcher',
  name: 'Researcher',
  description: 'Searches for facts and compiles a report.',
  instructions:
    "You are a research assistant. Use the search tool to find facts about the user's topic, then write a 2-3 sentence report. " +
    "Search for different aspects — don't repeat the same query. " +
    'If you see a system message warning you to finalize, stop searching and write your report immediately with whatever you have.',
  outputMode: 'text',
  tools: ['demo.search'],
});

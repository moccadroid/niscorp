// Researcher specialist for the research-desk demo: searches for
// facts and returns raw findings. Includes the search tool it uses.

import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';

export const researchSearchTool = defineTool({
  id: 'desk.search',
  name: 'search',
  description: 'Searches for facts about a topic. Returns a snippet.',
  riskLevel: 'low',
  input: z.object({
    query: z.string().describe('The search query.'),
  }),
  execute: async ({ query }) => {
    const db: Record<string, string> = {
      ai: 'AI investment reached $200B globally in 2025, with foundation model training costs doubling annually.',
      regulation: 'The EU AI Act classifies AI systems by risk tier. High-risk systems require conformity assessments.',
      jobs: 'Studies show AI augments 60% of knowledge work tasks but fully automates less than 5% of occupations.',
      safety: 'Leading AI labs committed to pre-deployment safety testing under the Seoul AI Safety Compact.',
      open: 'Open-source AI models now match proprietary systems on many benchmarks, driving enterprise adoption.',
    };
    const key = Object.keys(db).find((k) => query.toLowerCase().includes(k));
    return { snippet: key ? db[key] : `General finding about "${query}": significant ongoing developments.` };
  },
});

export const researcherAgent = defineAgent({
  id: 'desk.researcher',
  name: 'Researcher',
  description: 'Searches for facts and returns raw findings.',
  instructions:
    'You are a research specialist. Use the search tool to find 2-3 facts about the given topic. ' +
    'Return your raw findings as a brief list. No analysis, just facts.',
  outputMode: 'text',
  tools: ['desk.search'],
});

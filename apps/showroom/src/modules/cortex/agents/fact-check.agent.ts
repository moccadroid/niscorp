// Fact-finder agent + a fact-lookup tool. Used by the budget-
// guardian rules story (the budget rule lives there).

import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';

export const factTool = defineTool({
  id: 'demo.lookup_fact',
  name: 'lookup_fact',
  description: 'Looks up a fact about a topic. Returns a one-sentence answer.',
  riskLevel: 'low',
  input: z.object({
    topic: z.string().describe('The topic to look up.'),
  }),
  execute: async ({ topic }) => {
    const facts: Record<string, string> = {
      population: 'The world population reached 8 billion in 2022.',
      gdp: 'Global GDP was approximately $100 trillion in 2022.',
      internet: 'About 5.3 billion people use the internet worldwide.',
      space: 'The International Space Station orbits at about 408 km altitude.',
      default: `Interesting fact about ${topic}: it is a widely studied subject.`,
    };
    const key = Object.keys(facts).find((k) => topic.toLowerCase().includes(k));
    return { fact: facts[key ?? 'default'] };
  },
});

export const factCheckAgent = defineAgent({
  id: 'demo.fact-finder',
  name: 'Fact Finder',
  description: 'Looks up facts and writes a brief report.',
  instructions:
    'You are a fact-finding agent. Use the lookup_fact tool to research the topic, ' +
    'then compile a brief report. Search for 2-3 different aspects. ' +
    'If you see a budget warning, immediately finalize with what you have.',
  outputMode: 'text',
  tools: ['demo.lookup_fact'],
});

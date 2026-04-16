// Multi-tick plan-mode agent — uses the word_count tool, observes
// the result, then finalizes with the count. Demonstrates the tick
// loop driving the agent across multiple model calls.

import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';

export const wordCountTool = defineTool({
  id: 'demo.word_count',
  name: 'word_count',
  description: 'Counts the words in a string. Returns { count: number }.',
  riskLevel: 'low',
  input: z.object({
    text: z.string().describe('The text to count words in.'),
  }),
  execute: async ({ text }) => {
    const count = text.trim().split(/\s+/).filter(Boolean).length;
    return { count };
  },
});

export const analyzerPlanner = defineAgent({
  id: 'demo.plan.analyzer',
  name: 'Analyzer (multi-tick)',
  description:
    'A plan-mode agent that uses the word_count tool, observes the result, then finalizes with the count.',
  instructions:
    'You are a text analyzer. The user gives you some text. Your job: use the word_count tool to count its words, then return a final node with { wordCount: <number>, text: <user input> }. ' +
    "Tick 1: return a plan with a single use_tool node calling word_count with the user's text. " +
    'Tick 2: after seeing the observation, return a plan with a single final node containing the structured result. ' +
    'No prose, no markdown fences, just the JSON array each tick.',
  outputMode: 'plan',
  tools: ['demo.word_count'],
  maxTicks: 4,
});

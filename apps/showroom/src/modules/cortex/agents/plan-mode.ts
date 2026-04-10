// ═══════════════════════════════════════════════════════════
// Plan-mode demo agents
// ═══════════════════════════════════════════════════════════
//
// Three agents for the plan-mode demos:
//   - greeterPlanner   — single-tick demo. Returns a one-element
//                        plan with just a `final` node. Shows the
//                        ActionPlan contract at minimum.
//   - analyzerPlanner  — multi-tick. Uses the word_count tool, then
//                        finalizes with the count once it sees the
//                        observation. Shows the tick loop driving
//                        the agent across multiple model calls.
//   - directorPlanner  — uses ask_agent to delegate to two specialist
//                        agents (summarizer + classifier). Shows
//                        multi-agent coordination via Cortex's
//                        plan executor.
//
// Plus the two specialists the director uses:
//   - summarizerAgent  — text mode, returns a one-line summary.
//   - classifierAgent  — structured mode, returns a category label.

import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';

// ───────────────────────────────────────────────────────────
// Tool: word count (used by analyzerPlanner)
// ───────────────────────────────────────────────────────────

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

// ───────────────────────────────────────────────────────────
// Demo 1: greeterPlanner — single-tick finalize
// ───────────────────────────────────────────────────────────

export const greeterPlanner = defineAgent({
  id: 'demo.plan.greeter',
  name: 'Greeter (single-tick)',
  description:
    'The simplest possible plan-mode agent: returns a plan with one final node. Shows the ActionPlan contract.',
  instructions:
    'You are a friendly greeter. Return a plan that contains EXACTLY ONE final node, whose result is a string greeting the user. ' +
    'Example output: [{"kind":"final","result":"Hello there!"}]. No prose, no markdown fences, just the JSON array.',
  outputMode: 'plan',
});

// ───────────────────────────────────────────────────────────
// Demo 2: analyzerPlanner — multi-tick with a tool
// ───────────────────────────────────────────────────────────

export const analyzerPlanner = defineAgent({
  id: 'demo.plan.analyzer',
  name: 'Analyzer (multi-tick)',
  description:
    'A plan-mode agent that uses the word_count tool, observes the result, then finalizes with the count.',
  instructions:
    'You are a text analyzer. The user gives you some text. Your job: use the word_count tool to count its words, then return a final node with { wordCount: <number>, text: <user input> }. ' +
    'Tick 1: return a plan with a single use_tool node calling word_count with the user\'s text. ' +
    'Tick 2: after seeing the observation, return a plan with a single final node containing the structured result. ' +
    'No prose, no markdown fences, just the JSON array each tick.',
  outputMode: 'plan',
  tools: ['demo.word_count'],
  // Allow up to 4 ticks to give the model some slack.
  maxToolIterations: 4,
});

// ───────────────────────────────────────────────────────────
// Demo 3: director + specialists
// ───────────────────────────────────────────────────────────

// Specialist 1: summarizer (text mode)
export const summarizerAgent = defineAgent({
  id: 'demo.plan.summarizer',
  name: 'Summarizer',
  description: 'Returns a one-line summary of the input text.',
  instructions:
    'Return a single short sentence (under 20 words) summarizing the user input. No prose around it, just the sentence.',
  outputMode: 'text',
});

// Specialist 2: classifier (structured mode)
export const ClassificationSchema = z
  .object({
    category: z.enum(['news', 'opinion', 'tutorial', 'fiction', 'other']),
    confidence: z.number().min(0).max(1).describe('Confidence in the category, 0–1.'),
  })
  .strict();
export type Classification = z.infer<typeof ClassificationSchema>;

export const classifierAgent = defineAgent<Classification>({
  id: 'demo.plan.classifier',
  name: 'Classifier',
  description: 'Classifies the input text into a category.',
  instructions:
    'Classify the user input into one of: news, opinion, tutorial, fiction, other. Return JSON {category, confidence}. No prose.',
  outputMode: 'structured',
  outputSchema: ClassificationSchema,
});

// Director: a plan-mode agent that delegates to both specialists in parallel.
export const directorPlanner = defineAgent({
  id: 'demo.plan.director',
  name: 'Director (delegation)',
  description:
    'Plan-mode agent that delegates to a summarizer and a classifier in parallel via ask_agent, then finalizes with both results.',
  instructions:
    'You are a director that coordinates two specialists. Your job, given some text:\n' +
    '1. On the first tick, return a plan with a parallel node containing two ask_agent nodes:\n' +
    '   - one to demo.plan.summarizer with the user text as input\n' +
    '   - one to demo.plan.classifier with the user text as input\n' +
    '2. On the next tick, after seeing both observations, return a plan with a single final node whose result is { summary, classification, original }, populated from the observations.\n' +
    'Each plan should be a JSON array. No prose, no markdown fences.',
  outputMode: 'plan',
  maxToolIterations: 4,
});

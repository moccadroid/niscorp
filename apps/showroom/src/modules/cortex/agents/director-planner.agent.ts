// Director plan-mode agent: delegates to summarizer + classifier
// in parallel via ask_agent, then finalizes with both results.
// Demonstrates multi-agent coordination through Cortex's plan
// executor.

import { defineAgent } from '@niscorp/cortex';

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
  maxTicks: 4,
});

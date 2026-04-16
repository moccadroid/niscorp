// Single-tick plan-mode agent. Returns a one-element plan with
// just a `final` node — the smallest demo of the ActionPlan
// contract.

import { defineAgent } from '@niscorp/cortex';

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

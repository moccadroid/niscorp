// ═══════════════════════════════════════════════════════════
// Tool-use demo stories
// ═══════════════════════════════════════════════════════════

import type { CortexStory } from '../story-types';
import { weatherAgent, getWeatherTool } from '../agents/weather';

const weatherHappy: CortexStory = {
  id: 'tool-use.weather.happy',
  name: 'Weather (multi-city)',
  description:
    'Cortex tool loop in action. The user mentions two cities; the agent calls the weather tool twice, observes the results, and finalizes a structured report. Watch the live tool timeline.',
  category: 'Multi-step tool use',
  kind: 'tool-use',
  demo: 'tool-use',
  agent: weatherAgent,
  tools: [getWeatherTool],
  prompt: "What's the weather in Berlin and Paris right now?",
};

const weatherBudgetFail: CortexStory = {
  id: 'tool-use.weather.budget-fail',
  name: 'Weather + tight budget (denied)',
  description:
    "Same agent, same prompt. The only difference: the manifold is given a tight per-run token budget. Cortex's tool-loop gate fires after the first iteration (which already exceeded the cap) and denies further tool calls. The run is supposed to fail — pass means the gate fired as expected.",
  category: 'Policy & budgets',
  kind: 'tool-use',
  demo: 'tool-use',
  agent: weatherAgent,
  tools: [getWeatherTool],
  prompt: "What's the weather in Berlin and Paris right now?",
  budget: { maxTokens: 50 },
  expectPolicyDenial: true,
};

export const weatherStories: readonly CortexStory[] = [weatherHappy, weatherBudgetFail];

import { defineRule, runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { rateLimitedResearchAgent, researchTool } from '@showroom/modules/cortex/agents/rate-limited-research.agent';
import agentSource from '@showroom/modules/cortex/agents/rate-limited-research.agent?raw';
import { DEFAULT_MODEL, PROVIDER, RulesDemo, type RunnerWithBus } from '@showroom/modules/cortex/atoms';

const agent = rateLimitedResearchAgent;
const tools = [researchTool];
const prompt = 'Write a comprehensive report about climate change — cover causes, effects, and solutions.';

// Tool rate-limiter — declarative steering by tool-call count.
// Exported so the happy-path story can demonstrate the same rule
// never firing on a smaller workload.
export const toolRateLimitRule = defineRule({
  id: 'tool-rate-limit',
  description: 'Warns after 3 tool calls, aborts after 5.',
  watch: {
    toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.toolCalls', 5] },
      then: { abort: 'Hard limit: 5 tool calls exceeded. Aborting run.' },
    },
    {
      when: { $gte: ['$watch.toolCalls', 3] },
      then: { inject: '⚠ RULE ENGINE: You have made 3+ tool calls. Finalize your report NOW with what you have. Do not make any more tool calls.' },
    },
  ],
});

const rules = [toolRateLimitRule];

// Rules engine: declarative JSON conditions watch bus events and
// fire effects (inject context, abort run). The bus subscription
// captures rule evaluations for the live timeline.
const runner: RunnerWithBus = ({ apiKey, client, onObservation, onRetry, onBus }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, rules, onObservation, onRetry, onBus });
};

export { agent, tools, rules, prompt, agentSource };

export const Demo = () => (
  <RulesDemo storyId="rules.tool-rate-limit" prompt={prompt} runner={runner} />
);

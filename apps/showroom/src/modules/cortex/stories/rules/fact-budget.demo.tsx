import { defineRule, runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { factCheckAgent, factTool } from '@showroom/modules/cortex/agents/fact-check.agent';
import agentSource from '@showroom/modules/cortex/agents/fact-check.agent?raw';
import { DEFAULT_MODEL, PROVIDER, RulesDemo, type RunnerWithBus } from '@showroom/modules/cortex/atoms';

const agent = factCheckAgent;
const tools = [factTool];
const prompt =
  'Research everything you can about the state of the world — population, economy, technology, and space.';

const budgetGuardianRule = defineRule({
  id: 'budget-guardian',
  description: 'Warns at 3 observations, aborts at 5 — simulating a token budget guardian.',
  watch: {
    observations: { event: 'cortex.observation.recorded', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.observations', 5] },
      then: { abort: 'Budget guardian: observation limit exceeded. Forcing early termination.' },
    },
    {
      when: { $gte: ['$watch.observations', 3] },
      then: { inject: '💰 BUDGET WARNING: You have used over half your observation budget. Wrap up your research and finalize your report in the next step. No more tool calls.' },
    },
  ],
});

const rules = [budgetGuardianRule];

const runner: RunnerWithBus = ({ apiKey, client, onObservation, onRetry, onBus }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, rules, onObservation, onRetry, onBus });
};

export { agent, tools, rules, prompt, agentSource };

export const Demo = () => (
  <RulesDemo storyId="rules.budget-guardian" prompt={prompt} runner={runner} />
);

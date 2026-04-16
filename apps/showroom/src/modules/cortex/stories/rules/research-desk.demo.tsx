import { defineRule, runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { directorAgent } from '@showroom/modules/cortex/agents/director.agent';
import { researcherAgent, researchSearchTool } from '@showroom/modules/cortex/agents/researcher.agent';
import { analystAgent } from '@showroom/modules/cortex/agents/analyst.agent';
import { writerAgent } from '@showroom/modules/cortex/agents/writer.agent';
import agentSource from '@showroom/modules/cortex/agents/director.agent?raw';
import { DEFAULT_MODEL, PROVIDER, RulesDemo, type RunnerWithBus } from '@showroom/modules/cortex/atoms';

const agent = directorAgent;
const tools = [researchSearchTool];
const specialists = [researcherAgent, analystAgent, writerAgent];
const prompt = 'Research the current state of AI regulation and its impact on the industry.';

const deskBudgetRule = defineRule({
  id: 'desk-budget',
  description: 'Warns at 5 observations, aborts at 8 — keeps the multi-agent workflow bounded.',
  watch: {
    totalObs: { event: 'cortex.observation.recorded', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.totalObs', 8] },
      then: { abort: 'Research desk budget exceeded. Too many observations.' },
    },
    {
      when: { $gte: ['$watch.totalObs', 5] },
      then: { inject: '💰 BUDGET: The workflow has used 5+ observations. Finalize with what you have — skip remaining specialists if needed.' },
    },
  ],
});

const rules = [deskBudgetRule];

const runner: RunnerWithBus = ({ apiKey, client, onObservation, onRetry, onBus }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, {
    llm,
    tools,
    specialists,
    rules,
    onObservation,
    onRetry,
    onBus,
  });
};

export { agent, tools, specialists, rules, prompt, agentSource };

export const Demo = () => (
  <RulesDemo storyId="rules.research-desk" prompt={prompt} runner={runner} />
);

import { defineRule, runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { dbReadAgent, dbTool } from '@showroom/modules/cortex/agents/db-read.agent';
import agentSource from '@showroom/modules/cortex/agents/db-read.agent?raw';
import { DEFAULT_MODEL, PROVIDER, RulesDemo, type RunnerWithBus } from '@showroom/modules/cortex/atoms';

const agent = dbReadAgent;
const tools = [dbTool];
const prompt = 'Look up customers C-001, C-002, and C-003. Tell me who they are and their account balances.';

const compoundRule = defineRule({
  id: 'enterprise-guard',
  description: 'When 2+ queries AND latest result is enterprise tier, inject a compliance warning.',
  watch: {
    queries: { event: 'cortex.tool.observed', aggregate: 'count' },
    lastTier: { event: 'cortex.observation.recorded', aggregate: 'latest', field: 'result.tier' },
  },
  rules: [
    {
      when: {
        $and: [
          { $gte: ['$watch.queries', 2] },
          { $eq: ['$watch.lastTier', 'enterprise'] },
        ],
      },
      then: { inject: '🔒 COMPLIANCE: Enterprise customer data accessed. You MUST include a compliance disclaimer in your report: "Enterprise data accessed under audit policy §4.2. Do not share externally."' },
    },
  ],
});

const rules = [compoundRule];

const runner: RunnerWithBus = ({ apiKey, client, onObservation, onRetry, onBus }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, rules, onObservation, onRetry, onBus });
};

export { agent, tools, rules, prompt, agentSource };

export const Demo = () => (
  <RulesDemo storyId="rules.compound-condition" prompt={prompt} runner={runner} />
);

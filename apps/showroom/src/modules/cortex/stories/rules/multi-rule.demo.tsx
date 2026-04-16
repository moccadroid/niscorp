import { defineRule, runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { multiRuleAgent, webSearchTool } from '@showroom/modules/cortex/agents/multi-rule.agent';
import agentSource from '@showroom/modules/cortex/agents/multi-rule.agent?raw';
import { DEFAULT_MODEL, PROVIDER, RulesDemo, type RunnerWithBus } from '@showroom/modules/cortex/atoms';

const agent = multiRuleAgent;
const tools = [webSearchTool];
const prompt = 'Compare TypeScript, Rust, Python, Go, and Haskell. What are the latest developments in each?';

const rateLimitRule = defineRule({
  id: 'rate-limiter',
  description: 'Injects a warning after 3 tool calls.',
  watch: {
    toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.toolCalls', 3] },
      then: { inject: '⚠ RATE LIMIT: You have made 3+ tool calls. Wrap up your research and write your comparison now.' },
    },
  ],
});

const qualityGateRule = defineRule({
  id: 'quality-gate',
  description: 'Injects guidance when a search returns no results.',
  watch: {
    lastSnippet: { event: 'cortex.observation.recorded', aggregate: 'latest', field: 'result.snippet' },
  },
  rules: [
    {
      when: { $eq: ['$watch.lastSnippet', 'no results'] },
      then: { inject: '🔍 QUALITY: Your last search returned no results. Try a different search strategy — use different keywords or a broader topic.' },
    },
  ],
});

const budgetRule = defineRule({
  id: 'budget-abort',
  description: 'Hard abort after 5 total observations.',
  watch: {
    totalObs: { event: 'cortex.observation.recorded', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.totalObs', 5] },
      then: { abort: 'Budget guardian: 5 observation limit reached. Forcing termination.' },
    },
  ],
});

const rules = [rateLimitRule, qualityGateRule, budgetRule];

const runner: RunnerWithBus = ({ apiKey, client, onObservation, onRetry, onBus }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, rules, onObservation, onRetry, onBus });
};

export { agent, tools, rules, prompt, agentSource };

export const Demo = () => (
  <RulesDemo storyId="rules.multi-rule" prompt={prompt} runner={runner} />
);

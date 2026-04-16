import { defineRule, runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { supportAgent, sentimentTool } from '@showroom/modules/cortex/agents/support.agent';
import agentSource from '@showroom/modules/cortex/agents/support.agent?raw';
import { DEFAULT_MODEL, PROVIDER, RulesDemo, type RunnerWithBus } from '@showroom/modules/cortex/atoms';

const agent = supportAgent;
const tools = [sentimentTool];
const prompt =
  "I am absolutely furious. Your product is broken and useless. I've wasted hours on this terrible software and I want my money back immediately.";

const escalationRule = defineRule({
  id: 'sentiment-escalation',
  description: 'Injects an escalation warning when sentiment drops below 0.3.',
  watch: {
    lastSentiment: { event: 'cortex.observation.recorded', aggregate: 'latest', field: 'result.score' },
  },
  rules: [
    {
      when: { $lt: ['$watch.lastSentiment', 0.3] },
      then: { inject: '🚨 ESCALATION ALERT: Customer sentiment is critically negative. Switch to maximum empathy mode. Apologize sincerely, offer a concrete resolution (refund/callback/priority ticket). Do NOT be defensive.' },
    },
  ],
});

const rules = [escalationRule];

const runner: RunnerWithBus = ({ apiKey, client, onObservation, onRetry, onBus }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, rules, onObservation, onRetry, onBus });
};

export { agent, tools, rules, prompt, agentSource };

export const Demo = () => (
  <RulesDemo storyId="rules.sentiment-escalation" prompt={prompt} runner={runner} />
);

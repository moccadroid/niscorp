import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { quickResearchAgent, researchTool } from '@showroom/modules/cortex/agents/quick-research.agent';
import { toolRateLimitRule } from './rate-limited-research.demo';
import agentSource from '@showroom/modules/cortex/agents/quick-research.agent?raw';
import { DEFAULT_MODEL, PROVIDER, RulesDemo, type RunnerWithBus } from '@showroom/modules/cortex/atoms';

// Same rate-limit rule as rate-limited-research.demo, but the user
// asks a simple question that needs only 1-2 tool calls. The rule
// watches silently and never triggers — rules are zero-cost when
// conditions aren't met.

const agent = quickResearchAgent;
const tools = [researchTool];
const prompt = 'How much has Arctic sea ice declined?';
const rules = [toolRateLimitRule];

const runner: RunnerWithBus = ({ apiKey, client, onObservation, onRetry, onBus }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, rules, onObservation, onRetry, onBus });
};

export { agent, tools, rules, prompt, agentSource };

export const Demo = () => (
  <RulesDemo storyId="rules.happy-path" prompt={prompt} runner={runner} />
);

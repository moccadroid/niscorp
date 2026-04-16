import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { weatherAgent, getWeatherTool } from '@showroom/modules/cortex/agents/weather.agent';
import agentSource from '@showroom/modules/cortex/agents/weather.agent?raw';
import { DEFAULT_MODEL, PROVIDER, ToolUseDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = weatherAgent;
const tools = [getWeatherTool];
const prompt = "What's the weather in Berlin and Paris right now?";

// Same agent, same tools, same prompt as the happy-path story.
// The lesson is the manifold override — a tight per-run token
// budget. Cortex's tool-loop gate fires once the cap is exceeded
// and denies further calls. Pass = gate fired as expected.
const runner: Runner = ({ apiKey, client, onObservation, onRetry }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, {
    llm,
    tools,
    manifold: {
      defaultBudget: { maxTokens: 50, maxToolCalls: 200, maxTicks: 20, maxDurationMs: 60_000 },
    },
    onObservation,
    onRetry,
  });
};

export { agent, tools, prompt, agentSource };

export const Demo = () => (
  <ToolUseDemo
    storyId="tool-use.weather.budget-fail"
    prompt={prompt}
    runner={runner}
    expectPolicyDenial
  />
);

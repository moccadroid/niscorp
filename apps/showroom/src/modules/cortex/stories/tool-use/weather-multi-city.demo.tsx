import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { weatherAgent, getWeatherTool } from '@showroom/modules/cortex/agents/weather.agent';
import agentSource from '@showroom/modules/cortex/agents/weather.agent?raw';
import { DEFAULT_MODEL, PROVIDER, ToolUseDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = weatherAgent;
const tools = [getWeatherTool];
const prompt = "What's the weather in Berlin and Paris right now?";

// Tool loop: model decides which tools to invoke, Cortex validates
// each call's input against the tool's Zod schema, executes it,
// feeds the result back as the next observation, and repeats until
// the model finalizes.
const runner: Runner = ({ apiKey, client, onObservation, onRetry }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, onObservation, onRetry });
};

export { agent, tools, prompt, agentSource };

export const Demo = () => (
  <ToolUseDemo storyId="tool-use.weather.happy" prompt={prompt} runner={runner} />
);

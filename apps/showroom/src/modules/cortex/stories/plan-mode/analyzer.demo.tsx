import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { analyzerPlanner, wordCountTool } from '@showroom/modules/cortex/agents/analyzer-planner.agent';
import agentSource from '@showroom/modules/cortex/agents/analyzer-planner.agent?raw';
import { DEFAULT_MODEL, PROVIDER, PlanModeDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = analyzerPlanner;
const tools = [wordCountTool];
const prompt = 'Count the words in: "The quick brown fox jumps over the lazy dog."';

// Multi-tick plan-mode: tick 1 returns a use_tool plan; tick 2,
// after seeing the observation, returns a final.
const runner: Runner = ({ apiKey, client, onObservation, onRetry }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, onObservation, onRetry });
};

export { agent, tools, prompt, agentSource };

export const Demo = () => (
  <PlanModeDemo storyId="plan-mode.analyzer" prompt={prompt} runner={runner} />
);

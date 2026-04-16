import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { greeterPlanner } from '@showroom/modules/cortex/agents/greeter-planner.agent';
import agentSource from '@showroom/modules/cortex/agents/greeter-planner.agent?raw';
import { DEFAULT_MODEL, PROVIDER, PlanModeDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = greeterPlanner;
const prompt = 'Say hello to me.';

// Plan mode: agent returns an ActionPlan (JSON DSL) each tick;
// Cortex's plan executor walks it. This is the smallest possible
// plan — one final node, one tick.
const runner: Runner = ({ apiKey, client, onObservation, onRetry }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, onObservation, onRetry });
};

export { agent, prompt, agentSource };

export const Demo = () => (
  <PlanModeDemo storyId="plan-mode.greeter" prompt={prompt} runner={runner} />
);

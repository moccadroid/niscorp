import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { financialAgent, checkBalanceTool, transferFundsTool } from '@showroom/modules/cortex/agents/financial.agent';
import agentSource from '@showroom/modules/cortex/agents/financial.agent?raw';
import { DEFAULT_MODEL, PROVIDER, ConfirmationDemo, type RunnerWithBus } from '@showroom/modules/cortex/atoms';

const agent = financialAgent;
const tools = [checkBalanceTool, transferFundsTool];
const prompt = 'Transfer $500 from Carol to Bob.';

const runner: RunnerWithBus = ({ apiKey, client, onObservation, onRetry, onBus }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, onObservation, onRetry, onBus });
};

export { agent, tools, prompt, agentSource };

export const Demo = () => (
  <ConfirmationDemo storyId="confirmation.deny" prompt={prompt} runner={runner} />
);

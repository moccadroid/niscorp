import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { financialAgent, checkBalanceTool, transferFundsTool } from '@showroom/modules/cortex/agents/financial.agent';
import agentSource from '@showroom/modules/cortex/agents/financial.agent?raw';
import { DEFAULT_MODEL, PROVIDER, ConfirmationDemo, type RunnerWithBus } from '@showroom/modules/cortex/atoms';

const agent = financialAgent;
const tools = [checkBalanceTool, transferFundsTool];
const prompt = "Check Alice's balance, then transfer $200 from Alice to Bob.";

// The agent's policy marks transfer_funds as requireConfirmation,
// so Cortex pauses on that tool call and emits a confirmation
// request on the bus. The bus subscription captures it; the
// orchestrator surfaces an Approve/Deny dialog.
const runner: RunnerWithBus = ({ apiKey, client, onObservation, onRetry, onBus }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, tools, onObservation, onRetry, onBus });
};

export { agent, tools, prompt, agentSource };

export const Demo = () => (
  <ConfirmationDemo storyId="confirmation.approve" prompt={prompt} runner={runner} />
);

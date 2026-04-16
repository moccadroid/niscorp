import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { directorPlanner } from '@showroom/modules/cortex/agents/director-planner.agent';
import { summarizerAgent } from '@showroom/modules/cortex/agents/summarizer.agent';
import { classifierAgent } from '@showroom/modules/cortex/agents/classifier.agent';
import agentSource from '@showroom/modules/cortex/agents/director-planner.agent?raw';
import { DEFAULT_MODEL, PROVIDER, PlanModeDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = directorPlanner;
const specialists = [summarizerAgent, classifierAgent];
const prompt =
  'In 2026, advances in autonomous agent runtimes have made it practical for one LLM call to coordinate multiple specialists in parallel. This article explores how a director agent uses Cortex to delegate work without orchestration boilerplate.';

// Plan-mode director with two specialists registered — `ask_agent`
// plan nodes can delegate to either. Cortex registers them on the
// same manifold so the director can find them.
const runner: Runner = ({ apiKey, client, onObservation, onRetry }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, prompt, { llm, specialists, onObservation, onRetry });
};

const specialistsBlurb = specialists
  .map((s) => `- ${s.config.id} (${s.config.outputMode}) — ${s.config.description}`)
  .join('\n');

export { agent, specialists, prompt, agentSource };

export const Demo = () => (
  <PlanModeDemo
    storyId="plan-mode.director"
    prompt={prompt}
    runner={runner}
    specialistsBlurb={specialistsBlurb}
  />
);

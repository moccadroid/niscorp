import { defineAgent } from '@niscorp/cortex';
import { RunPanel } from '../atoms/run-panel';

// A pure chat agent: no output schema, so the envelope's `response` is
// required and `data` is undefined. Watch the right pane — the reply
// streams through solid's output-partial as the respond call's
// arguments generate, not after the run ends.

const chatAgent = defineAgent({
  id: 'demo.chat',
  description: 'A concise showroom assistant.',
  instructions:
    'You are a concise, friendly assistant inside the niscorp showroom. Answer in two or three sentences, plain text.',
});

export const Demo = () => (
  <RunPanel
    initialInput="Explain, briefly, why streaming a JSON envelope beats waiting for the full response."
    makeRun={(llm, input, onEvent) => chatAgent.run(input, { llm, onEvent })}
  />
);

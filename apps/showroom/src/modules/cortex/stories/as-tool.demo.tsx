import { z } from 'zod';
import { asTool, defineAgent } from '@niscorp/cortex';
import { RunPanel } from '../atoms/run-panel';

// Delegation is a tool call: asTool wraps the specialist as an
// ordinary tool. The child's events forward into the parent stream —
// the event pane shows its lines tagged [orchestrator › headliner].
// The child's envelope data becomes the tool result the parent sees.

const headliner = defineAgent({
  id: 'headliner',
  description: 'Writes one punchy headline for a given text.',
  instructions: 'Write ONE punchy headline (max 8 words) for the text you are given.',
  output: { schema: z.object({ headline: z.string() }) },
});

export const Demo = () => (
  <RunPanel
    inputRows={4}
    initialInput="Researchers demonstrated a solar cell coating that raises panel efficiency by 4% and survives hail; production could start within two years."
    makeRun={(llm, input, onEvent) => {
      const orchestrator = defineAgent({
        id: 'orchestrator',
        description: 'Delegates headline writing.',
        instructions:
          'Send the text to the headliner tool, then respond: put its headline in your response with one sentence on why it works.',
        tools: [asTool(headliner, { llm })],
      });
      return orchestrator.run(input, { llm, onEvent });
    }}
  />
);

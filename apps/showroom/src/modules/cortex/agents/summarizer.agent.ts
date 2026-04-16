// Specialist agent for the director plan-mode demo: returns a
// one-line summary of the input text. Mounted as a specialist via
// ask_agent.

import { defineAgent } from '@niscorp/cortex';

export const summarizerAgent = defineAgent({
  id: 'demo.plan.summarizer',
  name: 'Summarizer',
  description: 'Returns a one-line summary of the input text.',
  instructions:
    'Return a single short sentence (under 20 words) summarizing the user input. No prose around it, just the sentence.',
  outputMode: 'text',
});

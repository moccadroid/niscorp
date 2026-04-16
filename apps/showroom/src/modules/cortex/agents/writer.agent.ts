// Writer specialist for the research-desk demo: takes a structured
// analysis and writes a polished executive summary.

import { defineAgent } from '@niscorp/cortex';

export const writerAgent = defineAgent({
  id: 'desk.writer',
  name: 'Writer',
  description: 'Writes a polished summary from an analysis.',
  instructions:
    'You are a writer. You will receive an analysis as input (claim, confidence, key points). ' +
    'Write a polished 2-3 sentence executive summary. Be clear and concise. ' +
    'Mention the confidence level naturally (e.g. "with high confidence" or "tentatively").',
  outputMode: 'text',
});

// Plan-mode director for the research-desk demo: coordinates
// researcher → analyst → writer in sequence to produce a polished
// research brief.

import { defineAgent } from '@niscorp/cortex';

export const directorAgent = defineAgent({
  id: 'desk.director',
  name: 'Research Director',
  description: 'Coordinates researcher, analyst, and writer to produce a research brief.',
  instructions:
    'You are a research director coordinating three specialists. Given a topic:\n' +
    "1. First tick: delegate to desk.researcher with the user's topic as input.\n" +
    "2. Second tick: after seeing the researcher's findings, delegate to desk.analyst with those findings as input.\n" +
    '3. Third tick: after seeing the analysis, delegate to desk.writer with the analysis as input.\n' +
    "4. Fourth tick: after seeing the written summary, return a final node whose result is the writer's output.\n" +
    'Each tick: return a JSON array with one ask_agent node. No prose, no markdown fences.\n' +
    'If you see a budget warning, skip remaining steps and finalize with what you have.',
  outputMode: 'plan',
  maxTicks: 6,
});

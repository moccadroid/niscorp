import * as demo from './research-desk.demo';
import source from './research-desk.demo?raw';

export const story = {
  id: 'rules.research-desk',
  name: 'Research desk (multi-agent)',
  description:
    'A plan-mode director coordinates three specialists: a researcher (text + tools), an analyst (structured output), and a writer (text). ' +
    'The director delegates sequentially via ask_agent. A budget rule watches the entire workflow and warns if it takes too long. ' +
    'Watch the timeline: multiple agents, multiple modes, all in one workflow.',
  category: 'Multi-agent orchestration',
  kind: 'rules' as const,
  ...demo,
  source,
};

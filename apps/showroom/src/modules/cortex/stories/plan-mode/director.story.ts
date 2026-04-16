import * as demo from './director.demo';
import source from './director.demo?raw';

export const story = {
  id: 'plan-mode.director',
  name: 'Director (delegation, parallel ask_agent)',
  description:
    'A plan-mode director that delegates to two specialist agents in parallel via ask_agent. The summarizer (text mode) and classifier (structured mode) run concurrently inside a parallel branch. Once both observations are in, the director returns a final result combining both.',
  category: 'ask_agent delegation',
  kind: 'plan-mode' as const,
  ...demo,
  source,
};

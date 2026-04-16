import * as demo from './analyzer.demo';
import source from './analyzer.demo?raw';

export const story = {
  id: 'plan-mode.analyzer',
  name: 'Analyzer (multi-tick + tool)',
  description:
    'A plan-mode agent that takes more than one tick to finish. Tick 1 returns a plan with a use_tool node calling word_count. Tick 2, after seeing the observation, returns a plan with a final node containing the result. Shows the tick loop driving the agent across iterations.',
  category: 'Multi-tick with tool',
  kind: 'plan-mode' as const,
  ...demo,
  source,
};

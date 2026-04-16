import * as demo from './multi-rule.demo';
import source from './multi-rule.demo?raw';

export const story = {
  id: 'rules.multi-rule',
  name: 'Multi-rule orchestration',
  description:
    'Three independent rules steer one agent simultaneously. A rate-limiter warns after 3 tool calls. A quality gate detects "no results" and suggests strategy changes. A budget guardian aborts after 5 observations. Watch all three evaluate independently in the timeline.',
  category: 'Rule composition',
  kind: 'rules' as const,
  ...demo,
  source,
};

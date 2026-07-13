import * as demo from './approval.demo';
import source from './approval.demo?raw';

export const story = {
  id: 'approval',
  name: 'Gates + approval',
  description:
    'policy.requireApproval suspends the run BEFORE the tool executes; approve (optionally with edited args) or deny from the UI. A denial is an observation the model sees — the run continues.',
  category: 'Gates',
  kind: 'gates' as const,
  ...demo,
  source,
};

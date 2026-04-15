import * as demo from './strict-halt.demo';
import source from './strict-halt.demo?raw';

export const story = {
  id: 'strict-halt',
  name: 'Strict halt',
  description: 'Strict mode enters a terminal failed state on the first violation. No further updates are applied.',
  category: 'Validation',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};

import * as demo from './select-api.demo';
import source from './select-api.demo?raw';

export const story = {
  id: 'select-api',
  name: 'Independent selections',
  description: 'Four select() subscriptions — each renders independently, each finalizes at its own pace.',
  category: 'Live UI',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};

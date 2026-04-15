import { Demo } from './list.demo';
import source from './list.demo?raw';

export const story = {
  id: 'list',
  name: 'List add/remove',
  description:
    '`push` feeds a `for` loop. Clicking Add grows `$.items`, the loop re-renders, and the counter text bumps automatically.',
  category: 'Data',
  kind: 'action' as const,
  Demo,
  source,
};

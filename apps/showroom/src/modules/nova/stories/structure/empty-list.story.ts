import { Demo } from './empty-list.demo';
import source from './empty-list.demo?raw';

export const story = {
  id: 'structure-empty-list',
  name: 'Empty list',
  description:
    '`if` on `$.items.length` wraps a `for` in its `then` and a placeholder Text in its `else`. Empty arrays get a gray "No items yet." instead of blank space.',
  category: 'Structure',
  kind: 'layout' as const,
  Demo,
  source,
};

import * as demo from './merge.demo';
import source from './merge.demo?raw';

export const story = {
  id: 'merge',
  name: '$merge',
  description: 'Shallow merges multiple objects left to right. Later objects overwrite earlier ones — useful for "default options + user overrides" patterns.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};

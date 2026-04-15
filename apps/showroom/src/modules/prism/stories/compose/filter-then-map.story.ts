import * as demo from './filter-then-map.demo';
import source from './filter-then-map.demo?raw';

export const story = {
  id: 'filter-then-map',
  name: 'Filter → map',
  description: 'Compose ops by nesting them. Filter the array first, then map the survivors into a different shape. Each op produces a value the next op consumes.',
  category: 'Composition',
  kind: 'transform' as const,
  ...demo,
  source,
};

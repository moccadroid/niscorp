import * as demo from './with.demo';
import source from './with.demo?raw';

export const story = {
  id: 'with',
  name: '$with',
  description: 'Binds local variables in a scoped block. Variables are read inside the block via $var. Useful for naming intermediate values and avoiding repetition.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};

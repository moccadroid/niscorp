import * as demo from './keys-values.demo';
import source from './keys-values.demo?raw';

export const story = {
  id: 'keys-values',
  name: '$keys / $values',
  description: 'Decompose an object into its keys or values arrays. Useful when you want to count fields, iterate, or feed the keys into another op.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};

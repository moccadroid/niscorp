import * as demo from './strings.demo';
import source from './strings.demo?raw';

export const story = {
  id: 'strings',
  name: 'String ops',
  description: 'String manipulation primitives: `$lower`, `$upper`, `$trim`, `$split`, `$replace`, `$length`. Each consumes a string (or string expression) and returns a transformed value.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};

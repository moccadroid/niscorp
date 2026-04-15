import * as demo from './logic.demo';
import source from './logic.demo?raw';

export const story = {
  id: 'logic',
  name: 'Logic ops',
  description: '`$and`, `$or`, `$not` — boolean combinators with short-circuit semantics. `$and` returns the last truthy value or the first falsy; `$or` returns the first truthy or the last falsy; `$not` flips truthiness.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};

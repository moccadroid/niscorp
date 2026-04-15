import * as demo from './counter.demo';
import source from './counter.demo?raw';

export const story = {
  id: 'counter',
  name: 'Counter',
  description:
    'A minimal counter action with `count` in data. Click Increment or Decrement — the trigger fires the `increment`/`decrement` op on the `count` path, the data store updates, and the Text re-renders showing the new value.',
  category: 'Basics',
  kind: 'action' as const,
  ...demo,
  source,
};

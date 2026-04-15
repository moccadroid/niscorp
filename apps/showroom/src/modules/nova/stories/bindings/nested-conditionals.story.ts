import { Demo } from './nested-conditionals.demo';
import source from './nested-conditionals.demo?raw';

export const story = {
  id: 'bindings-nested-conditionals',
  name: 'Nested conditionals',
  description:
    'Two layers of `if/then/else`. Outer branches on whether a user exists; inner branches on admin. Three distinct render states.',
  category: 'Bindings',
  kind: 'layout' as const,
  Demo,
  source,
};

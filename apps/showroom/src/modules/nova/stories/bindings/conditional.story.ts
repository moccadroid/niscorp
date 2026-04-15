import { Demo } from './conditional.demo';
import source from './conditional.demo?raw';

export const story = {
  id: 'bindings-conditional',
  name: 'Conditional directive',
  description:
    '`if/then/else` layout nodes branching on `$.isLoggedIn`. Flip the flag and both Texts swap to their else branches — same layout shape, different children.',
  category: 'Bindings',
  kind: 'layout' as const,
  Demo,
  source,
};

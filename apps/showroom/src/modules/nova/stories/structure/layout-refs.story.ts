import { Demo } from './layout-refs.demo';
import source from './layout-refs.demo?raw';

export const story = {
  id: 'structure-layout-refs',
  name: 'Layout refs',
  description:
    'A reusable `user-card` layout is registered in the store, then referenced twice via `{ ref: "user-card" }`. One template, two identical cards.',
  category: 'Structure',
  kind: 'layout' as const,
  Demo,
  source,
};

import * as demo from './loop.demo';
import source from './loop.demo?raw';

export const story = {
  id: 'structure-loop',
  name: 'Loop',
  description:
    '`for`/`as`/`do` iterates `$.users` and emits one Box+Text per item. Four data entries become four cards, each bound to its own `$user` scope.',
  category: 'Structure',
  kind: 'layout' as const,
  ...demo,
  source,
};

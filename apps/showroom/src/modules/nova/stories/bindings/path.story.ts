import { Demo } from './path.demo';
import source from './path.demo?raw';

export const story = {
  id: 'bindings-path',
  name: 'Path bindings',
  description:
    'Raw `$.foo.bar` paths as Text children. The renderer resolves each path against the data tree and swaps in the value.',
  category: 'Bindings',
  kind: 'layout' as const,
  Demo,
  source,
};

import * as demo from './missing-paths.demo';
import source from './missing-paths.demo?raw';

export const story = {
  id: 'bindings-missing-paths',
  name: 'Missing paths',
  description:
    'Nonexistent paths resolve to empty strings — the layout still renders cleanly even when the data is partial.',
  category: 'Bindings',
  kind: 'layout' as const,
  ...demo,
  source,
};

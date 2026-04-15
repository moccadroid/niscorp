import * as demo from './performance.demo';
import source from './performance.demo?raw';

export const story = {
  id: 'performance',
  name: 'Performance (10 KB)',
  description: 'Stream a large payload character by character and watch the timing.',
  category: 'Performance',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};

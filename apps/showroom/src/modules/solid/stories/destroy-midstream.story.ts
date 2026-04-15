import * as demo from './destroy-midstream.demo';
import source from './destroy-midstream.demo?raw';

export const story = {
  id: 'destroy-midstream',
  name: 'Destroy mid-stream',
  description: 'Cancel a stream mid-flight — state freezes, listeners detach, promises reject.',
  category: 'Lifecycle',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};

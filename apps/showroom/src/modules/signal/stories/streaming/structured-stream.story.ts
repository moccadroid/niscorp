import * as demo from './structured-stream.demo';
import source from './structured-stream.demo?raw';

export const story = {
  id: 'structured-stream',
  name: 'Signal + Solid streaming',
  description:
    'signal.stream() pipes text deltas into solid.createStream(). Structured fields fill in live, with full type safety and validation.',
  category: 'Streaming',
  kind: 'stream' as const,
  ...demo,
  source,
};

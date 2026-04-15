import * as demo from './cross-canvas-messaging.demo';
import source from './cross-canvas-messaging.demo?raw';

export const story = {
  id: 'cross-canvas-messaging',
  name: 'Cross-canvas messaging',
  description:
    'Two canvases communicate via the shell message bus. Producer `emit`s a `cart-updated` channel; Consumer listens with a `message:` trigger and increments its counter.',
  category: 'Multi-canvas',
  kind: 'shell' as const,
  ...demo,
  source,
};

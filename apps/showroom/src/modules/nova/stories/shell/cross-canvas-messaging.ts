import { createShell } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import type { ShellStory } from '../../story-types';

const producer: ActionDefinition = {
  id: 'producer',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { weight: 'bold' }, children: 'Producer' },
      { component: 'Button', ref: 'add', children: 'Add to cart' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'add', do: [{ emit: { channel: 'cart-updated' } }] },
  ],
};

const consumer: ActionDefinition = {
  id: 'consumer',
  data: { count: 0 },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12, padding: 24 },
    children: [
      { component: 'Text', props: { weight: 'bold' }, children: 'Consumer' },
      { component: 'Text', children: 'Cart count: {{$.count}}' },
    ],
  },
  triggers: [
    { message: 'cart-updated', do: [{ increment: 'count' }] },
  ],
};

export const crossCanvasMessagingStory: ShellStory = {
  id: 'cross-canvas-messaging',
  name: 'Cross-canvas messaging',
  description:
    'Two canvases communicate via the shell message bus. The producer emits a cart-updated channel message; the consumer listens and increments its own counter.',
  kind: 'shell',
  category: 'Multi-canvas',
  shellSetup: ({ registry, layoutStore }) =>
    createShell({
      canvases: ['producer', 'consumer'],
      registry,
      layoutStore,
      actions: { producer, consumer },
      onError: (err) => {
        console.error(err);
      },
    }),
  initialPushes: [
    { canvas: 'producer', actionId: 'producer' },
    { canvas: 'consumer', actionId: 'consumer' },
  ],
  canvases: ['producer', 'consumer'],
  expected: { textIncludes: ['Producer', 'Consumer', 'Cart count: 0', 'Add to cart'] },
};

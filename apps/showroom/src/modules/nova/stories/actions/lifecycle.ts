import type { ActionStory } from '../../story-types';

export const lifecycleStory: ActionStory = {
  id: 'lifecycle',
  name: 'Lifecycle hooks',
  description:
    'Demonstrates the `mount` lifecycle hook on a single action. When the action mounts, two ops fire: `set mounted: true` and `push events: "mount"`. The view then shows "Mounted: true" and "Event count: 1" — proving the hook ran exactly once during action startup.',
  kind: 'action',
  category: 'Lifecycle',
  action: {
    id: 'lifecycle',
    data: { mounted: false, events: [] },
    layout: {
      component: 'Stack',
      props: { direction: 'column', gap: 12, padding: 24 },
      children: [
        {
          component: 'Text',
          props: { weight: 'bold' },
          children: 'Mounted: {{$.mounted}}',
        },
        {
          component: 'Text',
          children: 'Event count: {{$.events.length}}',
        },
      ],
    },
    lifecycle: {
      mount: [
        { set: 'mounted', value: true },
        { push: 'events', value: 'mount' },
      ],
    },
  },
  expected: { textIncludes: ['Mounted: true', 'Event count: 1'] },
};

import type { LayoutNode } from '@niscorp/nova';

// The controller, at thumb size: every control is a whole cell. The slide on
// screen, back and next, then the whole deck — press any slide to put it up.
export const consoleLayout: LayoutNode = {
  component: 'Sheet',
  // The slide on screen takes the middle; Back and Next are the last row, so
  // they stay at the bottom — and each says which slide it goes to. Every
  // slide is behind "All slides".
  props: { size: 'fill', areas: ['head head', 'slide slide', 'all all', 'back next'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    {
      component: 'Cell',
      props: { area: 'head' },
      children: [{ component: 'Label', children: 'Controller · {{$.counts.joined}} in the room · {{$.counts.assigned}} assigned' }],
    },
    {
      component: 'Cell',
      props: { area: 'slide', align: 'between' },
      children: [
        { component: 'Label', children: 'On screen · slide {{$.current.number}} of {{$.current.count}}' },
        { component: 'Headline', props: { level: 'title' }, children: '{{$.current.title}}' },
        { if: '$.error', then: { component: 'Text', children: '{{$.error}}' } },
      ],
    },
    { component: 'Action', ref: 'all', props: { area: 'all', label: 'All slides ({{$.current.count}})' } },
    {
      component: 'Action',
      ref: 'back',
      props: { area: 'back', label: { $if: '$.current.prev_title', $then: '← {{$.current.prev_number}} · {{$.current.prev_title}}', $else: 'Start of the deck' } },
    },
    {
      component: 'Action',
      ref: 'next',
      props: { area: 'next', ink: 'alert', label: { $if: '$.current.next_title', $then: '{{$.current.next_number}} · {{$.current.next_title}} →', $else: 'End of the deck' } },
    },
  ],
};

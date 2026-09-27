import type { LayoutNode } from '@niscorp/nova';

// Every slide one press away, and Back and Next — each saying where it goes.
export const controlsLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['all all', 'back next'] },
  children: [
    { component: 'Action', ref: 'all', props: { area: 'all', label: 'All slides ({{$.current.count}})' } },
    {
      component: 'Action',
      ref: 'back',
      props: { area: 'back', lines: 'two', label: { $if: '$.current.prev_title', $then: '← {{$.current.prev_number}} · {{$.current.prev_title}}', $else: 'Start of the deck' } },
    },
    {
      component: 'Action',
      ref: 'next',
      props: { area: 'next', ink: 'alert', lines: 'two', label: { $if: '$.current.next_title', $then: '{{$.current.next_number}} · {{$.current.next_title}} →', $else: 'End of the deck' } },
    },
  ],
};

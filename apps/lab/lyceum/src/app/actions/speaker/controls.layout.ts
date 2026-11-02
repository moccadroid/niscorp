import type { LayoutNode } from '@niscorp/nova';

// While the slide on screen has parts still to show, Next shows the next one and
// Back hides the last; past them, they move between slides.
export const controlsLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['all all', 'back next'] },
  children: [
    { component: 'Action', ref: 'all', props: { area: 'all', label: 'All slides ({{$.current.count}})' } },
    {
      component: 'Action',
      ref: 'back',
      props: {
        area: 'back',
        lines: 'two',
        label: {
          $if: '$.step.step',
          $then: '← Part {{$.step.step}} of {{$.step.parts}}',
          $else: { $if: '$.current.prev_title', $then: '← {{$.current.prev_number}} · {{$.current.prev_title}}', $else: 'Start of the deck' },
        },
      },
    },
    {
      component: 'Action',
      ref: 'next',
      props: {
        area: 'next',
        ink: 'alert',
        lines: 'two',
        label: {
          $if: '$.step.more',
          $then: 'Part {{$.step.next_part}} of {{$.step.parts}} →',
          $else: { $if: '$.current.next_title', $then: '{{$.current.next_number}} · {{$.current.next_title}} →', $else: 'End of the deck' },
        },
      },
    },
  ],
};

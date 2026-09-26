import type { LayoutNode } from '@niscorp/nova';

// The controller, at thumb size: every control is a whole cell. The slide on
// screen, back and next, then the whole deck — press any slide to put it up.
export const consoleLayout: LayoutNode = {
  component: 'Sheet',
  // The deck takes whatever height is left and scrolls inside itself; Back and
  // Next are the last row, so they stay at the bottom however long the deck.
  props: { size: 'fill', areas: ['head head', 'slide slide', 'deck deck', 'back next'], rows: ['auto', 'auto', 1, 'auto'] },
  children: [
    {
      component: 'Cell',
      props: { area: 'head' },
      children: [{ component: 'Label', children: 'Controller · {{$.counts.joined}} in the room · {{$.counts.assigned}} assigned' }],
    },
    {
      component: 'Cell',
      props: { area: 'slide', ink: 'ink' },
      children: [
        { component: 'Label', children: 'Slide {{$.current.number}} / {{$.count.slides}} — {{$.current.title}}' },
        { component: 'Headline', props: { level: 'title' }, children: '{{$.current.title}}' },
        { if: '$.error', then: { component: 'Text', children: '{{$.error}}' } },
      ],
    },
    {
      component: 'Cell',
      props: { area: 'deck', pad: 'none', scroll: 'y' },
      children: [
        {
          component: 'Rows',
          props: {
            rows: '$.slides',
            rowKey: 'position',
            rowRef: 'pick',
            selected: '$.current.position',
            columns: [
              { label: '#', key: 'number', kind: 'mono', w: 0.4 },
              { label: 'The deck — press a slide to put it up', key: 'title', w: 5 },
            ],
          },
        },
      ],
    },
    { component: 'Action', ref: 'back', props: { area: 'back', label: '← Back' } },
    { component: 'Action', ref: 'next', props: { area: 'next', ink: 'alert', label: 'Next →' } },
  ],
};

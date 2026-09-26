import type { LayoutNode } from '@niscorp/nova';

// The speaker's controller, at thumb size: every control is a whole cell, and
// the one block of ink is the action that moves the talk on.
export const consoleLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'slide slide', 'room room', 'back next', 'sort unsort'], rows: ['auto', 1, 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'head' }, children: [{ component: 'Label', children: 'Controller' }] },
    {
      component: 'Cell',
      props: { area: 'slide', align: 'between' },
      children: [
        { component: 'Label', children: 'Slide {{$.current.number}} / {{$.count.slides}} — {{$.current.title}}' },
        { component: 'Headline', props: { level: 'title' }, children: '{{$.current.title}}' },
      ],
    },
    {
      component: 'Cell',
      props: { area: 'room' },
      children: [
        { component: 'Label', children: '{{$.counts.joined}} joined · {{$.counts.sorted}} sorted' },
        { if: '$.error', then: { component: 'Text', props: { tone: 'muted' }, children: '{{$.error}}' } },
      ],
    },
    { component: 'Action', ref: 'back', props: { area: 'back', ink: 'ink', label: '← Back' } },
    { component: 'Action', ref: 'next', props: { area: 'next', ink: 'alert', label: 'Next →' } },
    {
      component: 'Action',
      ref: 'sort',
      props: { area: 'sort', ink: 'signal', label: { $if: '$.sorting', $then: 'Sorting…', $else: 'Sort the room' } },
    },
    { component: 'Action', ref: 'unsort', props: { area: 'unsort', label: 'Unsort (testing)' } },
  ],
};

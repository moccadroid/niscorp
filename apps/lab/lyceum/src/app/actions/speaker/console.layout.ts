import type { LayoutNode } from '@niscorp/nova';

// The controller, at thumb size: every control is a whole cell. The slide on
// screen, back and next, then the whole deck — press any slide to put it up.
export const consoleLayout: LayoutNode = {
  component: 'Sheet',
  // The slide on screen takes the middle; Back and Next are the last row, so
  // they stay at the bottom. Every slide is behind "All slides".
  props: { size: 'fill', areas: ['head head', 'slide slide', 'all all', 'back next'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    {
      component: 'Cell',
      props: { area: 'head' },
      children: [{ component: 'Label', children: 'Controller · {{$.counts.joined}} in the room · {{$.counts.assigned}} assigned' }],
    },
    {
      component: 'Cell',
      props: { area: 'slide', ink: 'ink', align: 'between' },
      children: [
        { component: 'Label', children: 'Slide {{$.current.number}} / {{$.count.slides}} — {{$.current.title}}' },
        { component: 'Headline', props: { level: 'title' }, children: '{{$.current.title}}' },
        { if: '$.error', then: { component: 'Text', children: '{{$.error}}' } },
      ],
    },
    { component: 'Action', ref: 'all', props: { area: 'all', label: 'All slides ({{$.count.slides}}) →' } },
    { component: 'Action', ref: 'back', props: { area: 'back', label: '← Back' } },
    { component: 'Action', ref: 'next', props: { area: 'next', ink: 'alert', label: 'Next →' } },
  ],
};

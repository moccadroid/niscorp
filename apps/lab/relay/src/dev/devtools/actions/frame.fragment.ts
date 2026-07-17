import type { ActionFragment } from '@niscorp/nova';

// Shared chrome for actions pushed onto the devtools canvas — the same
// composition pattern as relay's modal/panel fragments. Provides the dark
// panel, a sticky header (title from `$.frameTitle`, a top-right ✕ that pops
// back down the devtools stack), and a scrolling body; the composed action's
// own layout drops into `{ slot: 'body' }`. The dock itself is NOT wrapped —
// it's the stack root (✕ there collapses to the pill instead of popping).
export const devtoolsFrameFragment: ActionFragment = {
  kind: 'fragment',
  id: 'devtools.frame',
  name: 'Devtools panel chrome',
  data: { frameTitle: '⚙ devtools' },
  triggers: [{ event: 'ui:click', ref: 'devtools-close', do: [{ pop: true }] }],
  layout: {
    component: 'DevtoolsPanel',
    children: {
      component: 'Stack',
      props: { gap: 8, shrink: true },
      children: [
        {
          component: 'Row',
          props: { gap: 8, align: 'center' },
          children: [
            { component: 'Text', props: { size: 'md', weight: 700, mono: true }, children: '{{$.frameTitle}}' },
            { component: 'Box', props: { grow: true } },
            { component: 'Button', ref: 'devtools-close', props: { size: 'sm', variant: 'ghost' }, children: '✕' },
          ],
        },
        { component: 'Box', props: { grow: true, scroll: true }, children: { slot: 'body' } },
      ],
    },
  },
};

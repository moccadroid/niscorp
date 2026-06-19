import type { ActionFragment } from '@niscorp/nova';

// The reusable modal chrome — as DATA, not React. Composed into a concrete
// action at a push `with: ['modal']`: the fragment wraps the action, dropping
// the action's own layout into `{ slot: 'body' }`. The action stays
// render-location-agnostic; this supplies the backdrop + card + header + footer
// and the close/cancel wiring. The action supplies the body, the title/labels
// (via its `data`), and what Confirm does.
//
// Chrome that's pure CSS is the `Overlay` primitive (the dimmed, centering
// backdrop) + the kit's .rl-dialog classes on plain Boxes. Behaviour is wired
// here: ✕ and the backdrop fire `ui:click ref="close"`, Cancel fires `cancel`,
// both pop. Confirm (`ref="confirm"`) is left for the composing action.
export const modalFragment: ActionFragment = {
  kind: 'fragment',
  id: 'modal',
  layout: {
    component: 'Overlay',
    children: {
      component: 'Box',
      props: { class: 'rl-dialog' },
      children: [
        {
          component: 'Box',
          props: { class: 'rl-dialog__head' },
          children: [
            { component: 'Box', props: { class: 'rl-dialog__title' }, children: '$.modalTitle' },
            {
              component: 'Button',
              ref: 'close',
              props: { variant: 'ghost', size: 'sm' },
              children: '✕',
            },
          ],
        },
        {
          component: 'Box',
          props: { class: 'rl-dialog__body' },
          children: { slot: 'body' },
        },
        {
          component: 'Box',
          props: { class: 'rl-dialog__foot' },
          children: [
            {
              component: 'Button',
              ref: 'cancel',
              props: { variant: 'default' },
              children: 'Cancel',
            },
            {
              component: 'Button',
              ref: 'confirm',
              props: { variant: 'primary' },
              children: '$.confirmLabel',
            },
          ],
        },
      ],
    },
  },
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
  ],
};

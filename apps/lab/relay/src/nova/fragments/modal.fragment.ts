import type { ActionFragment } from '@niscorp/nova';

// The modal chrome — just the overlay, card, and a title header (modal-only
// niceties). Composed at a push `with: ['modal']`: it wraps the action, dropping
// its layout into `{ slot: 'body' }`. The form owns its OWN footer (Cancel +
// Confirm), inline in its layout, so it submits on any canvas — this only adds the
// dialog dressing on the `modal` canvas. The backdrop + ✕ fire `ui:click
// ref="close"` → pop; that's the only behaviour here.
export const modalFragment: ActionFragment = {
  kind: 'fragment',
  id: 'modal',
  layout: {
    component: 'Overlay',
    children: {
      component: 'Dialog',
      children: [
        {
          component: 'DialogHead',
          children: [
            { component: 'DialogTitle', children: '$.modalTitle' },
            { component: 'Button', ref: 'close', props: { variant: 'ghost', size: 'sm' }, children: '✕' },
          ],
        },
        {
          component: 'DialogBody',
          children: { slot: 'body' },
        },
      ],
    },
  },
  triggers: [{ event: 'ui:click', ref: 'close', do: [{ pop: true }] }],
};

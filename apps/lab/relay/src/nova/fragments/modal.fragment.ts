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
      component: 'Box',
      props: { class: 'rl-dialog' },
      children: [
        {
          component: 'Box',
          props: { class: 'rl-dialog__head' },
          children: [
            { component: 'Box', props: { class: 'rl-dialog__title' }, children: '$.modalTitle' },
            { component: 'Button', ref: 'close', props: { variant: 'ghost', size: 'sm' }, children: '✕' },
          ],
        },
        {
          component: 'Box',
          props: { class: 'rl-dialog__body' },
          children: { slot: 'body' },
        },
      ],
    },
  },
  triggers: [{ event: 'ui:click', ref: 'close', do: [{ pop: true }] }],
};

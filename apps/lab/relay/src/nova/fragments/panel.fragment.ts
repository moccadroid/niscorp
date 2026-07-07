import type { ActionFragment } from '@niscorp/nova';

// `panel` — the chrome for showing a content-only action as a centered overlay
// card on the modal canvas. The action provides its own body (header, content);
// this supplies the backdrop + card. Card width comes from the action's data
// `$.panelClass` (e.g. 'rl-dialog--wide' for a record, 'rl-dialog--narrow' for a
// small dialog), so the same fragment serves any modal content. Unlike `modal`
// it adds no form footer — the action owns its actions.
export const panelFragment: ActionFragment = {
  kind: 'fragment',
  id: 'panel',
  layout: {
    component: 'Overlay',
    children: {
      component: 'Box',
      props: { class: 'rl-dialog rl-panel {{$.panelClass}}' },
      children: [
        { component: 'Box', props: { class: 'rl-panel__close' }, children: { component: 'Button', ref: 'panel-close', props: { variant: 'ghost', size: 'sm' }, children: '✕' } },
        // Scroll region so tall content (e.g. Settings opened on the modal canvas)
        // scrolls inside the height-bounded card instead of overflowing it. The
        // card's max-height: 86vh bounds it; the absolute ✕ above stays pinned.
        { component: 'Box', props: { scroll: true, grow: true }, children: { slot: 'body' } },
      ],
    },
  },
  // The card supplies its own close, so any content placed here is dismissable
  // (a record, or anything Ray opens on the modal canvas).
  triggers: [{ event: 'ui:click', ref: 'panel-close', do: [{ pop: true }] }],
};

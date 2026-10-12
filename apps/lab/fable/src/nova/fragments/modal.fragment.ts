import type { ActionFragment } from '@niscorp/nova';

export const modalFragment: ActionFragment = {
  kind: 'fragment',
  id: 'modal',
  layout: {
    component: 'Overlay',
    children: {
      component: 'Box',
      props: { class: 'fb-dialog' },
      children: [
        {
          component: 'Box',
          props: { class: 'fb-dialog__head' },
          children: [
            { component: 'Box', props: { class: 'fb-dialog__title' }, children: '$.modalTitle' },
            { component: 'Button', ref: 'close', props: { variant: 'ghost', size: 'sm' }, children: '✕' },
          ],
        },
        {
          component: 'Box',
          props: { class: 'fb-dialog__body' },
          children: { slot: 'body' },
        },
      ],
    },
  },
  triggers: [{ event: 'ui:click', ref: 'close', do: [{ pop: true }] }],
};

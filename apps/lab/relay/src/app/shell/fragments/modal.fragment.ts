import type { ActionFragment } from '@niscorp/nova';

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

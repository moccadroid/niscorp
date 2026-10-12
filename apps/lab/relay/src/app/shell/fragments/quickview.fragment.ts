import type { ActionFragment } from '@niscorp/nova';

export const quickviewFragment: ActionFragment = {
  kind: 'fragment',
  id: 'quickview',
  layout: {
    component: 'Overlay',
    children: {
      component: 'Dialog',
      props: { size: 'wide' },
      children: [
        {
          component: 'DialogHead',
          children: [
            {
              component: 'DialogTitle',
              children: '$.quickviewTitle',
            },
            {
              component: 'Row',
              props: { gap: 6, align: 'center' },
              children: [
                {
                  component: 'Button',
                  ref: 'fullscreen',
                  props: { variant: 'default', size: 'sm' },
                  children: 'Open fullscreen',
                },
                {
                  component: 'Button',
                  ref: 'close',
                  props: { variant: 'ghost', size: 'sm' },
                  children: '✕',
                },
              ],
            },
          ],
        },
        {
          component: 'DialogBody',
          children: { slot: 'body' },
        },
      ],
    },
  },
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    // `pop` is last: it closes this action.
    {
      event: 'ui:click',
      ref: 'fullscreen',
      do: [
        {
          resetTo: {
            action: '{{$.fullscreenAction}}',
            canvas: 'main',
            input: {
              rows: '$.rows',
              dash: '$.dash',
              settings: '$.settings',
              queryId: '$.queryId',
              context: '$.context',
              highlight_id: '$.highlight_id',
              loading: false,
            },
          },
        },
        { emit: { channel: 'screen-{{$.fullscreenAction}}' } },
        { pop: true },
      ],
    },
  ],
};

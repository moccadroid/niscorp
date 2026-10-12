import type { ActionFragment } from '@niscorp/nova';

export const previewFragment: ActionFragment = {
  kind: 'fragment',
  id: 'preview',
  data: { previewTitle: '', previewId: '' },
  layout: {
    component: 'Dock',
    props: { open: true, side: 'left', wide: true },
    children: {
      component: 'Stack',
      props: { gap: 0, h: '100%', shrink: true },
      children: [
        {
          component: 'Box',
          props: { px: 16, py: 11, border: 'bottom' },
          children: {
            component: 'Row',
            props: { justify: 'between', align: 'center', gap: 10 },
            children: [
              {
                component: 'Row',
                props: { gap: 10, align: 'center' },
                children: [
                  { component: 'Button', ref: 'preview-back', props: { variant: 'plain', icon: 'back', label: 'Back to the catalog' }, children: '' },
                  {
                    component: 'Stack',
                    props: { gap: 0 },
                    children: [
                      { component: 'Text', props: { serif: true, size: 'lg' }, children: '$.previewTitle' },
                      { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '{{$.previewId}} — sample data derived from its own bindings, no endpoints. Nothing here is real and nothing is wired.' },
                    ],
                  },
                ],
              },
              { component: 'Badge', props: { tone: 'warn' }, children: 'preview' },
            ],
          },
        },
        { component: 'Box', props: { grow: true, scroll: true, shrink: true, bg: 'ground', px: 16, py: 16 }, children: { slot: 'body' } },
      ],
    },
  },
  triggers: [{ event: 'ui:click', ref: 'preview-back', do: [{ pop: true }] }],
};

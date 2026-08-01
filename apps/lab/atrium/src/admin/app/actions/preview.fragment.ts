import type { ActionFragment } from '@niscorp/nova';

// The chrome a PREVIEWED layout wears.
//
// The preview action's layout is not ours — it is whatever the app server sent
// back for the action being inspected, registered onto this shell and pushed.
// So the frame around it cannot live in the layout: it is composed on at push
// time, exactly the way atrium's own sheet chrome wraps eight different actions
// without knowing what any of them are.
//
// What renders inside is the real thing: real components from the real kit, no
// endpoints and no triggers, filled with sample data derived from the layout's
// own bindings (see sample.ts — a layout says exactly which fields it will
// touch, so the shape is already written down).
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
        // The app's own ground, so the layout sits on the surface it was drawn
        // for rather than on our panel.
        { component: 'Box', props: { grow: true, scroll: true, shrink: true, bg: 'ground', px: 16, py: 16 }, children: { slot: 'body' } },
      ],
    },
  },
  triggers: [{ event: 'ui:click', ref: 'preview-back', do: [{ pop: true }] }],
};

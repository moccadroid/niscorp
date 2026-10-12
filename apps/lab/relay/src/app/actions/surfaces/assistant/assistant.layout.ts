import type { LayoutNode } from '@niscorp/nova';

export const assistantLayout: LayoutNode = [
    {
      component: 'DialogHead',
      children: [
        {
          component: 'Row',
          props: { gap: 8, align: 'center' },
          children: [
            { component: 'Box', props: { width: 150 }, children: { component: 'Select', ref: 'ray-session-select', model: '$.currentId', props: { options: '$.sessions', valueKey: 'id', labelKey: 'title' } } },
            { component: 'Button', ref: 'ray-new-session', props: { variant: 'default', size: 'sm', icon: 'plus' }, children: 'New' },
          ],
        },
        {
          component: 'Row',
          props: { gap: 6, align: 'center' },
          children: [
            { component: 'Button', ref: 'ray-close', props: { variant: 'ghost', size: 'sm' }, children: '✕' },
          ],
        },
      ],
    },
    {
      component: 'DialogBody',
      props: { grow: true, stickBottom: true },
      children: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          {
            if: '$.messages.length',
            then: {
              for: '$.messages',
              as: 'm',
              // No `key`: messages have no id, and the transcript is append-only,
              // so the iteration index is stable.
              do: {
                component: 'Stack',
                props: { gap: 2 },
                children: [
                  { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: '{{$.m.role}}' },
                  { if: '$.m.trace', then: { component: 'RayTrace', props: { steps: '$.m.trace', ms: '$.m.ms', debug: '$.debug' } } },
                  { component: 'Text', props: { size: 'sm' }, children: '{{$.m.text}}' },
                  { if: '$.m.view', then: { component: 'RayView', props: { layout: '$.m.view.layout', data: '$.m.view.data' } } },
                ],
              },
            },
            else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Ask Ray to open something, find a record, or describe what’s on screen.' },
          },
          { if: { $eq: ['$.status', 'thinking'] }, then: { component: 'RayTrace', props: { live: true, steps: '$.live', debug: '$.debug' } } },
        ],
      },
    },
    {
      component: 'DialogFoot',
      children: {
        component: 'Row',
        props: { gap: 8, align: 'end', grow: true },
        children: [
          { component: 'Box', props: { grow: true }, children: { component: 'Textarea', ref: 'ray-draft', model: '$.draft', props: { placeholder: 'Ask Ray…  (Enter to send, Shift+Enter for newline)', rows: 2 } } },
          {
            if: { $eq: ['$.status', 'thinking'] },
            then: { component: 'Button', ref: 'ray-stop', props: { variant: 'danger' }, children: 'Stop' },
            else: { component: 'Button', ref: 'ray-send', props: { variant: 'primary' }, children: 'Send' },
          },
        ],
      },
    },
];

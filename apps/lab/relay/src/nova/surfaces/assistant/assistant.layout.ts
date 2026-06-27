import type { LayoutNode } from '@niscorp/nova';

// Ray's chat panel — content only; the `dock` fragment supplies the right-docked
// placement (so the action stays canvas-agnostic). Header has the session
// switcher + New, the message log sticks to the bottom, and the input is a
// textarea (Enter sends, Shift+Enter newlines). Messages bind to `$.messages`;
// sessions to `$.sessions` / `$.currentId`.
export const assistantLayout: LayoutNode = [
    {
      component: 'Box',
      props: { class: 'rl-dialog__head' },
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
            { component: 'Button', ref: 'ray-set-key', props: { variant: 'ghost', size: 'sm' }, children: '🔑' },
            { component: 'Button', ref: 'ray-close', props: { variant: 'ghost', size: 'sm' }, children: '✕' },
          ],
        },
      ],
    },
    {
      component: 'Box',
      props: { class: 'rl-dialog__body', scroll: true, grow: true, stickBottom: true },
      children: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          {
            if: '$.messages.length',
            then: {
              for: '$.messages',
              as: 'm',
              // No `key` → the loop keys by iteration index. Messages have no id
              // field, and the transcript is append-only, so the index is stable.
              do: {
                component: 'Stack',
                props: { gap: 2 },
                children: [
                  { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: '{{$.m.role}}' },
                  { component: 'Text', props: { size: 'sm' }, children: '{{$.m.text}}' },
                ],
              },
            },
            else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Ask Ray to open something, find a record, or describe what’s on screen.' },
          },
          { if: { $eq: ['$.status', 'thinking'] }, then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Ray is thinking…' } },
        ],
      },
    },
    {
      component: 'Box',
      props: { class: 'rl-dialog__foot' },
      children: {
        component: 'Row',
        props: { gap: 8, align: 'end', grow: true },
        children: [
          { component: 'Box', props: { grow: true }, children: { component: 'Textarea', ref: 'ray-draft', model: '$.draft', props: { placeholder: 'Ask Ray…  (Enter to send, Shift+Enter for newline)', rows: 2 } } },
          { component: 'Button', ref: 'ray-send', props: { variant: 'primary' }, children: 'Send' },
        ],
      },
    },
];

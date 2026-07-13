import type { LayoutNode } from '@niscorp/nova';

// Ray's chat panel — content only; the `dock` fragment supplies the right-docked
// placement (so the action stays canvas-agnostic). Header has the session
// switcher + New, the message log sticks to the bottom, and the input is a
// textarea (Enter sends, Shift+Enter newlines). Messages bind to `$.messages`;
// sessions to `$.sessions` / `$.currentId`.
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
            { component: 'Button', ref: 'ray-set-key', props: { variant: 'ghost', size: 'sm' }, children: '🔑' },
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
              // No `key` → the loop keys by iteration index. Messages have no id
              // field, and the transcript is append-only, so the index is stable.
              do: {
                component: 'Stack',
                props: { gap: 2 },
                children: [
                  { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: '{{$.m.role}}' },
                  // The tool calls Ray made for this reply — between the name and
                  // the response. Always shows the tools; the debug toggle adds the
                  // expandable JSON. Absent on user messages (no trace).
                  { if: '$.m.trace', then: { component: 'RayTrace', props: { steps: '$.m.trace', ms: '$.m.ms' } } },
                  { component: 'Text', props: { size: 'sm' }, children: '{{$.m.text}}' },
                  // A layout Ray rendered for this message (step 1: static, in-chat).
                  { if: '$.m.view', then: { component: 'RayView', props: { layout: '$.m.view.layout', data: '$.m.view.data' } } },
                ],
              },
            },
            else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Ask Ray to open something, find a record, or describe what’s on screen.' },
          },
          // While thinking, the live trace streams in real time (debug on); with
          // debug off it just reads "Ray is thinking…".
          { if: { $eq: ['$.status', 'thinking'] }, then: { component: 'RayTrace', props: { live: true } } },
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
          { component: 'Button', ref: 'ray-send', props: { variant: 'primary' }, children: 'Send' },
        ],
      },
    },
];

import type { LayoutNode } from '@niscorp/nova';

// A line for the question, Send, and whether it went.
export const sendLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'field', 'go', 'out'], rows: ['auto', 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'alert' }, children: [{ component: 'Label', children: 'Q&A · a question for the speaker' }] },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Your question', enter: 'clears' } },
    { component: 'Action', ref: 'send', props: { area: 'go', ink: 'alert', label: 'Send →' } },
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
      else: {
        if: '$.sent',
        then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: 'Sent. The speaker has it.' }] },
        else: { component: 'Cell', props: { area: 'out', mark: 'hatch' }, children: [{ component: 'Text', props: { tone: 'muted' }, children: 'A question for the speaker.' }] },
      },
    },
  ],
};

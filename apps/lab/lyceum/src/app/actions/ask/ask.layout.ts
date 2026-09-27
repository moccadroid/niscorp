import type { LayoutNode } from '@niscorp/nova';
import { answerLayout } from '@lyceum/app/actions/shared/answer.layouts';

// A line to type, a button, and the answer in the shape the router picked
// (shared/answer.layouts.ts).
export const askLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'field', 'go', 'answer'], rows: ['auto', 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'signal' }, children: [{ component: 'Label', children: 'Ask the records · anything, in your own words' }] },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Who arrived first?' } },
    { component: 'Action', ref: 'ask', props: { area: 'go', ink: 'alert', label: 'Ask →' } },
    // One of four, in this order: what went wrong, the wait, the answer, or —
    // before anything was asked — where the answer will land.
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'answer' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
      else: {
        if: '$.asking',
        then: { component: 'Cell', props: { area: 'answer', mark: 'hatch' }, children: [{ component: 'Text', children: 'Asking the records…' }] },
        else: {
          if: '$.asked',
          then: {
            component: 'Cell',
            props: { area: 'answer' },
            children: answerLayout({ kind: '$.routed.kind', how: '$.routed.how', rows: '$.answer' }),
          },
          else: {
            component: 'Cell',
            props: { area: 'answer', mark: 'hatch' },
            children: [{ component: 'Text', children: 'Your answer lands here. A question nobody has asked is written by a model; one somebody has asked is replayed.' }],
          },
        },
      },
    },
  ],
};

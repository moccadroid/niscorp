import type { LayoutNode } from '@niscorp/nova';

// A line to type, a button, and the answer in the shape the router picked: one
// figure, or rows whose columns came back with the route.
export const askLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'field', 'go', 'answer'], rows: ['auto', 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'signal' }, children: [{ component: 'Label', children: 'Ask the records · anything, in your own words' }] },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Who arrived first?' } },
    { component: 'Action', ref: 'ask', props: { area: 'go', ink: 'alert', label: 'Ask →' } },
    {
      component: 'Cell',
      props: { area: 'answer' },
      children: [
        { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } },
        {
          if: '$.asking',
          then: { component: 'Cell', props: { mark: 'hatch' }, children: [{ component: 'Text', children: 'Asking the records…' }] },
        },
        {
          if: '$.asked',
          then: {
            component: 'Cell',
            props: { pad: 'none' },
            children: [
              {
                if: '$.routed.figure',
                then: { component: 'Figure', props: { label: 'The answer', value: '$.answer.value' } },
                else: { component: 'Rows', props: { rows: '$.answer', columns: '$.routed.columns', empty: 'Nothing on record.' } },
              },
              { component: 'Text', props: { tone: 'muted' }, children: '{{$.routed.said}}' },
            ],
          },
        },
      ],
    },
  ],
};

import type { LayoutNode } from '@niscorp/nova';

// A line for the question, Ask, and what came of the last one. The answer
// itself opens over the screen as the query it is (query/result.action.ts).
export const askLayout = (kicker: string): LayoutNode => ({
  component: 'Sheet',
  props: { areas: ['kick kick', 'field go', 'out out'], cols: [3, 1] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: kicker }] },
    { component: 'Field', ref: 'intent', model: '$.intent', props: { area: 'field', value: '$.intent', placeholder: 'A question about the room, in words' } },
    { component: 'Action', ref: 'ask', props: { area: 'go', ink: 'signal', label: 'Ask →' } },
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
      else: {
        if: '$.asking',
        then: { component: 'Cell', props: { area: 'out', mark: 'hatch' }, children: [{ component: 'Text', children: 'Asking…' }] },
        else: {
          if: '$.asked.routed.fingerprint',
          then: {
            component: 'Cell',
            props: { area: 'out' },
            children: [{ component: 'Label', children: 'Last answer · {{$.asked.routed.how}}' }, { component: 'Code', props: { text: '$.asked.routed.fingerprint' } }],
          },
          else: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', props: { tone: 'muted' }, children: 'The answer opens over the screen. The question is recorded as yours.' }] },
        },
      },
    },
  ],
});

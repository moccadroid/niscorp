import type { LayoutNode } from '@niscorp/nova';

// A line for the question, Ask, and what came of the last one. The answer
// itself opens over the screen as the query it is (query/result.action.ts).
//
// `given` names a shape the ask can carry: two buttons under the line, Jev's
// pick or that shape, the one that is on wearing the highlight.
const on = (isGiven: boolean): unknown => ({ $if: '$.shape', $then: isGiven ? 'highlight' : 'paper', $else: isGiven ? 'paper' : 'highlight' });

export const askLayout = (kicker: string, given?: string): LayoutNode => ({
  component: 'Sheet',
  props: given === undefined ? { areas: ['kick kick', 'field go', 'out out'], cols: [3, 1] } : { areas: ['kick kick kick kick', 'field field field go', 'jev jev given given', 'out out out out'], cols: [1, 1, 1, 1] },
  children: [
    ...(given === undefined
      ? []
      : ([
          { component: 'Action', ref: 'shapeJev', props: { area: 'jev', ink: on(false), label: 'Shape · Jev picks' } },
          { component: 'Action', ref: 'shapeGiven', props: { area: 'given', ink: on(true), label: `Shape · ${given}` } },
        ] as LayoutNode[])),
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

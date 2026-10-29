import type { ActionDefinition, Step } from '@niscorp/nova';
import { GIVEN_SHAPE } from '@lyceum/app/vex/query.shapes';
import { compactJson } from '../slide/compact';
import { askLayout } from './ask.layout';

// THE ASK — a question about the room, typed in words and answered by a vex
// query: a stored one replayed, or a new one written under the asker's own
// policy (server/functions/query.functions.ts). The answer opens over the
// screen as the query it is — intent, shape, fingerprint, result, and how it
// was reached — and the question is recorded as the asker's.
//
// Twice, the same: on the controller as a tool (`tools.ask`, the speaker's,
// whose run the stage watches — slide.writer), and on the phones (`ask.records`,
// given to everybody by the controller's tools.asker).
//
// A request is an intent and a shape. Jev picks the shape, unless the request
// carries one: the speaker's ask can give the nested shape (vex/query.shapes.ts)
// — `shape` is its name, sent with the ask; `shapeText` is the shape itself,
// for the stage to show before the ask is sent.

const ask: Step[] = [
  { set: 'error', value: '' },
  { set: 'asking', value: true },
  {
    call: 'ask',
    onSuccess: [
      { set: 'asking', value: false },
      { push: { action: 'query.result', canvas: 'overlay', with: ['sheet'], input: { intent: '$.asked.intent', shape: '$.asked.shape', routed: '$.asked.routed', sheetTitle: 'Query' } } },
    ],
    onError: [{ set: 'asking', value: false }],
  },
];

const askAction = (id: string, title: string, kicker: string, given?: string): ActionDefinition => ({
  id,
  title,
  data: { intent: '', shape: '', shapeText: '', asking: false, asked: { intent: '', shape: '', routed: { fingerprint: '', kind: '', how: '' } }, error: '' },
  layout: askLayout(kicker, given),
  // A question is a model's choice and, for a new one, a model writing: it
  // can take a while.
  endpoints: { ask: { fn: 'query.ask', target: 'asked', errorTarget: 'error', timeoutMs: 120_000 } },
  triggers: [
    { event: 'ui:click', ref: 'ask', do: ask },
    { event: 'ui:key', ref: 'intent', key: 'Enter', do: ask },
    ...(given === undefined
      ? []
      : [
          { event: 'ui:click', ref: 'shapeJev', do: [{ set: 'shape', value: '' }, { set: 'shapeText', value: '' }] },
          { event: 'ui:click', ref: 'shapeGiven', do: [{ set: 'shape', value: given }, { set: 'shapeText', value: compactJson(GIVEN_SHAPE.shape) }] },
        ]),
  ],
});

export const askTool = askAction('tools.ask', 'Ask the records', 'Ask the records — the room watches it answered', GIVEN_SHAPE.kind);
export const askRecordsAction = askAction('ask.records', 'Ask the records', 'Ask the records');

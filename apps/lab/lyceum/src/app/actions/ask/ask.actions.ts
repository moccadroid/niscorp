import type { ActionDefinition, Step } from '@niscorp/nova';
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

const askAction = (id: string, title: string, kicker: string): ActionDefinition => ({
  id,
  title,
  data: { intent: '', asking: false, asked: { intent: '', shape: '', routed: { fingerprint: '', kind: '', how: '' } }, error: '' },
  layout: askLayout(kicker),
  // A question is a model's choice and, for a new one, a model writing: it
  // can take a while.
  endpoints: { ask: { fn: 'query.ask', target: 'asked', errorTarget: 'error', timeoutMs: 120_000 } },
  triggers: [
    { event: 'ui:click', ref: 'ask', do: ask },
    { event: 'ui:key', ref: 'intent', key: 'Enter', do: ask },
  ],
});

export const askTool = askAction('tools.ask', 'Ask the records', 'Ask the records — the room watches it answered');
export const askRecordsAction = askAction('ask.records', 'Ask the records', 'Ask the records');

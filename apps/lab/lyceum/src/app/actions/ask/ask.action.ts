import type { ActionDefinition } from '@niscorp/nova';
import { TAB_BUTTON, TAB_INPUT, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { askLayout } from './ask.layout';
import { answerPrism } from './ask.prism';

// THE ASK — everybody's, whatever their department: put a question to the
// records in your own words.
//
// Two calls. `route` (server/functions/ask.functions.ts) decides how the
// question is answered — an earlier question's stored query, or a new one the
// model writes under your clearance — and hands back its fingerprint. `answer`
// then replays that fingerprint through vex directly, as you: the answer
// always comes the same way, and never from a function.
export const askAction: ActionDefinition = {
  id: 'ask.desk',
  title: 'Ask the records',
  data: {
    tab: false,
    tabLabel: 'Ask', tabInk: 'paper', nextInk: 'paper',
    draft: '',
    routed: { fingerprint: '', kind: '', how: '', said: '', figure: false, columns: [] },
    answer: [],
    asking: false,
    asked: false,
    error: '',
  },
  input: TAB_INPUT,
  layout: { if: '$.tab', then: TAB_BUTTON, else: askLayout },
  endpoints: {
    route: { fn: 'ask.route', target: 'routed', errorTarget: 'error' },
    answer: { url: '/api/vex', method: 'POST', request: answerPrism, target: 'answer', errorTarget: 'error' },
  },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'ask.desk', canvas: 'body' } }] },
    TAB_OPENED,
    {
      event: 'ui:click',
      ref: 'ask',
      do: [
        { set: 'error', value: '' },
        { set: 'asked', value: false },
        { set: 'asking', value: true },
        {
          call: 'route',
          onSuccess: [{ call: 'answer', onSuccess: [{ set: 'asked', value: true }, { set: 'asking', value: false }], onError: [{ set: 'asking', value: false }] }],
          onError: [{ set: 'asking', value: false }],
        },
      ],
    },
  ],
};

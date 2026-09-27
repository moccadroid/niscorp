import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { TAB_BUTTON, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { queryDeskLayout } from './desk.layout';
import { resultPrism } from './query.prism';

// THE QUERY DESK — everybody's, whatever their department: a vex query against
// the records, from a request in plain words.
//
// Two calls. `route` (server/functions/query.functions.ts) decides which query
// answers — an earlier request's stored one, or a new one the model writes
// under your clearance — and hands back its fingerprint. `result` then replays
// that fingerprint through vex directly, as you: the result always comes the
// same way, and never from a function. Enter in the field runs it too.
const run = [
  { set: 'error', value: '' },
  { set: 'answered', value: false },
  { set: 'running', value: true },
  {
    call: 'route',
    onSuccess: [{ call: 'result', onSuccess: [{ set: 'answered', value: true }, { set: 'running', value: false }], onError: [{ set: 'running', value: false }] }],
    onError: [{ set: 'running', value: false }],
  },
];

export const queryDeskAction: ActionDefinition = {
  id: 'query.desk',
  title: 'Query the records',
  data: {
    tab: false,
    tabLabel: 'Query',
    tabInk: 'paper',
    nextInk: 'paper',
    draft: '',
    routed: { fingerprint: '', kind: '', how: '' },
    result: [],
    running: false,
    answered: false,
    error: '',
  },
  input: z.toJSONSchema(
    z.object({
      tab: z.boolean().optional().describe("Render as a tab on the phone: a button that opens it in the phone's body."),
      tabInk: z.enum(['paper', 'ink']).optional().describe("The tab's ink: `ink` marks the tab whose action is open in the body."),
      draft: z.string().optional().describe('A request in plain words, put in the field ready to run.'),
    }),
  ),
  layout: { if: '$.tab', then: TAB_BUTTON, else: queryDeskLayout },
  endpoints: {
    route: { fn: 'query.route', target: 'routed', errorTarget: 'error' },
    result: { url: '/api/vex', method: 'POST', request: resultPrism, target: 'result', errorTarget: 'error' },
  },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'query.desk', canvas: 'body' } }] },
    TAB_OPENED,
    { event: 'ui:click', ref: 'run', do: run },
    { event: 'ui:key', ref: 'draft', key: 'Enter', do: run },
  ],
};

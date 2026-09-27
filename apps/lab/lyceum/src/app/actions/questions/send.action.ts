import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { TAB_BUTTON, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { questionSend } from '@lyceum/app/vex/question.entries';
import { sendLayout } from './send.layout';

// Q&A — everybody's: send the speaker a question. A write as the sender, and
// that is all; the speaker's controller lists them (tools/questions.action.ts).
// Enter sends too.
const send = [
  { set: 'error', value: '' },
  { call: 'send', onSuccess: [{ set: 'draft', value: '' }, { set: 'sent', value: true }] },
];

export const questionSendAction: ActionDefinition = {
  id: 'questions.send',
  title: 'Q&A',
  data: { tab: false, tabLabel: 'Q&A', tabInk: 'paper', nextInk: 'paper', draft: '', sent: false, error: '' },
  input: z.toJSONSchema(
    z.object({
      tab: z.boolean().optional().describe("Render as a tab on the phone: a button that opens it in the phone's body."),
      tabInk: z.enum(['paper', 'ink']).optional().describe("The tab's ink: `ink` marks the tab whose action is open in the body."),
      draft: z.string().optional().describe('A question for the speaker, put in the field ready to send.'),
    }),
  ),
  layout: { if: '$.tab', then: TAB_BUTTON, else: sendLayout },
  endpoints: {
    send: { url: '/api/vex', method: 'POST', request: { fingerprint: questionSend.fingerprint, context: { text: { $ref: '$.draft' } } }, errorTarget: 'error' },
  },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'questions.send', canvas: 'body' } }] },
    TAB_OPENED,
    { event: 'ui:click', ref: 'send', do: send },
    { event: 'ui:key', ref: 'draft', key: 'Enter', do: send },
  ],
};

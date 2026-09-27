import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { questionSend } from '@lyceum/app/vex/question.entries';
import { sendLayout } from './send.layout';

// A QUESTION FOR THE SPEAKER — the form alone: a line and Send (Enter sends
// too). A write as the sender, and that is all. On the phone it sits on the Q&A
// tab above the person's own questions (questions.desk); the assistant offers it
// by itself, pre-filled, over the screen.
const send = [
  { set: 'error', value: '' },
  { call: 'send', onSuccess: [{ set: 'draft', value: '' }, { set: 'sent', value: true }] },
];

export const questionSendAction: ActionDefinition = {
  id: 'questions.send',
  description: 'A form to send the speaker a question; it is sent only when they press Send.',
  title: 'Send the speaker a question',
  data: { draft: '', sent: false, error: '' },
  input: z.toJSONSchema(
    z.object({
      draft: z.string().optional().describe('A question for the speaker, put in the field ready to send.'),
    }),
  ),
  layout: sendLayout,
  endpoints: {
    send: { url: '/api/vex', method: 'POST', request: { fingerprint: questionSend.fingerprint, context: { text: { $ref: '$.draft' } } }, errorTarget: 'error' },
  },
  triggers: [
    { event: 'ui:click', ref: 'send', do: send },
    { event: 'ui:key', ref: 'draft', key: 'Enter', do: send },
  ],
};

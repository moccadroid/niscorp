import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { questionSend } from '@lyceum/app/vex/question.entries';
import { sendLayout } from './send.layout';

// A QUESTION FOR THE SPEAKER — the form alone: a line and Send. A write as the
// sender, and that is all. Nobody is granted it: the room's questions come
// through Acme. It is the action slide 8 shows as code, and its layout is that
// slide's preview — so it is written to be read: one trigger, one endpoint, no
// name used twice.
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
    post_question: { url: '/api/vex', method: 'POST', request: { fingerprint: questionSend.fingerprint, context: { text: { $ref: '$.draft' } } }, errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'send_btn',
      do: [
        { set: 'error', value: '' },
        { call: 'post_question', onSuccess: [{ set: 'draft', value: '' }, { set: 'sent', value: true }] },
      ],
    },
  ],
};

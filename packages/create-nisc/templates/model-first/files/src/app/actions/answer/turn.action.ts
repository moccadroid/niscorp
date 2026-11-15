import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';

// One turn of the conversation: what was asked, and the sentence the model answered with, or that it is still
// answering. Its cards follow it. Put on the conversation by the server (`ask`), never by the model.
export const turnAction: ActionDefinition = {
  id: 'answer.turn',
  title: 'You asked',
  description: 'One turn of the conversation: what the person asked, and what the model said back.',
  data: { question: '', reply: '', thinking: false },
  input: z.toJSONSchema(
    z.object({
      question: z.string().describe('What the person asked.'),
      reply: z.string().describe('What the model said back.'),
      thinking: z.boolean().describe('Whether the model is still answering.'),
    }),
  ),
  layout: {
    component: 'Card',
    props: { title: '{{$.question}}' },
    children: [{ if: '$.thinking', then: { component: 'Text', props: { tone: 'muted' }, children: 'Thinking…' }, else: { component: 'Text', children: '{{$.reply}}' } }],
  },
};

import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { textLayout } from './text.layout';

export const textAction: ActionDefinition = {
  id: 'answer.text',
  title: 'Text',
  description: 'A few words: a title, and at most two short sentences.',
  data: { title: '', text: '' },
  input: z.toJSONSchema(
    z.object({
      title: z.string().describe('A few words.'),
      text: z.string().describe('At most two short sentences.'),
    }),
  ),
  layout: textLayout,
};

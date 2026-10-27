import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { textLayout } from './text.layout';

export const textAction: ActionDefinition = {
  id: 'answer.text',
  title: 'Text',
  description: 'A few words: a title, and at most two short sentences.',
  data: { title: '', text: '', tone: 'default' },
  input: z.toJSONSchema(
    z.object({
      title: z.string().describe('A few words.'),
      text: z.string().describe('At most two short sentences.'),
      tone: z.enum(['default', 'hero']).optional().describe('default | hero: the card a screen opens with, its title large.'),
    }),
  ),
  layout: textLayout,
};

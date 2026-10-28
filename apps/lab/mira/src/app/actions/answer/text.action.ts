import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { textLayout } from './text.layout';

export const textAction: ActionDefinition = {
  id: 'answer.text',
  title: 'Text',
  description: 'Words to read: an answer, an explanation, steps, a list — what no other action shows.',
  data: { title: '', text: '', tone: 'default' },
  input: z.toJSONSchema(
    z.object({
      title: z.string().max(60).describe('A few words.'),
      text: z.string().max(1000).describe('What there is to read: a few sentences, or a line for each step or item.'),
      tone: z.enum(['default', 'hero']).optional().describe('default | hero: the card a screen opens with, its title large.'),
    }),
  ),
  layout: textLayout,
};

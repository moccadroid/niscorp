import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { textLayout } from './text.layout';

export const textAction: ActionDefinition = {
  id: 'answer.text',
  title: 'Text',
  description: 'Text: a title and a few sentences, or a list. For answering in words.',
  data: { title: '', text: '', tone: 'default' },
  input: z.toJSONSchema(
    z.object({
      title: z.string().max(60).describe('A short title, a few words.'),
      text: z.string().max(1000).describe('The text. One line per item for a list or steps.'),
      tone: z.enum(['default', 'hero']).optional().describe("'hero' only for the main first card of a screen; otherwise leave it out."),
    }),
  ),
  layout: textLayout,
};

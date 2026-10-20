import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { askExample, examplesLayout } from './examples.layout';

export const textAction: ActionDefinition = {
  id: 'answer.text',
  title: 'Text',
  description: 'A few words where no other action shows what was asked: what the app can do, that nothing answers a message, that a key is missing; with things to ask.',
  data: { title: '', text: '', examples: [] },
  input: z.toJSONSchema(
    z.object({
      title: z.string().describe('A few words.'),
      text: z.string().describe('At most two short sentences.'),
      examples: z.array(z.string()).describe('Things to ask.'),
    }),
  ),
  layout: { component: 'Card', props: { title: '{{$.title}}' }, children: [{ component: 'Text', children: '{{$.text}}' }, examplesLayout] },
  triggers: [{ event: 'ui:click', ref: 'example', do: askExample }],
};

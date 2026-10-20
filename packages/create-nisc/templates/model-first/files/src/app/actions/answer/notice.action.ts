import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { askExample, examplesLayout } from './examples.layout';

export const noticeAction: ActionDefinition = {
  id: 'answer.notice',
  title: 'Notice',
  description: 'Says what no other action can: that nothing answers a message yet, or that a key is missing; with things to ask instead.',
  data: { title: '', text: '', examples: [] },
  input: z.toJSONSchema(
    z.object({
      title: z.string().describe('The notice, in a few words.'),
      text: z.string().describe('What it means, in a sentence.'),
      examples: z.array(z.string()).describe('Things to ask instead.'),
    }),
  ),
  layout: { component: 'Card', props: { title: '{{$.title}}' }, children: [{ component: 'Text', children: '{{$.text}}' }, examplesLayout] },
  triggers: [{ event: 'ui:click', ref: 'example', do: askExample }],
};

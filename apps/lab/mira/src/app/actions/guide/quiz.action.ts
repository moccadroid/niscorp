import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { quizLayout } from './quiz.layout';

export const quizAction: ActionDefinition = {
  id: 'guide.quiz',
  title: 'Quick check',
  description: 'A question to check what was just read: a few options, one of them right; once a person picks, it shows which, and why.',
  data: { title: 'Quick check', question: '', options: [], answer: 0, explanation: '', picked: -1 },
  input: z.toJSONSchema(
    z.object({
      title: z.string().nullish().describe('A few words.'),
      question: z.string().describe('One short question.'),
      options: z.array(z.string()).min(2).max(4).describe('The options, each a few words.'),
      answer: z.number().int().min(0).describe('Which option is right, counted from 0.'),
      explanation: z.string().describe('Why that one is right, in one sentence.'),
      picked: z.number().int().min(-1).nullish().describe('Which option the person picked, counted from 0; -1 while they have not.'),
    }),
  ),
  layout: quizLayout,
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'picked', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'again', do: [{ set: 'picked', value: -1 }] },
  ],
};

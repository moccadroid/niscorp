import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { questionDelete, questionEdit, questionOne } from '@lyceum/app/vex/question.entries';

// ONE OF YOUR QUESTIONS, over the screen: change its words, or take it back.
// Both are writes as its sender, and reach only their own question
// (vex/behaviors.ts); either closes the sheet, and the list follows on its own.
// Enter saves.

export const questionEditAction: ActionDefinition = {
  id: 'questions.edit',
  title: 'Your question',
  data: { questionId: '', question: { question_id: '', text: '' }, draft: '', error: '' },
  input: z.toJSONSchema(
    z.object({
      questionId: z.string().optional().describe('Which of their questions.'),
    }),
  ),
  layout: {
    component: 'Sheet',
    props: { areas: ['field field', 'save remove', 'out out'], rows: ['auto', 'auto', 'auto'] },
    children: [
      { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Your question' } },
      { component: 'Action', ref: 'save', props: { area: 'save', ink: 'alert', label: 'Save →' } },
      { component: 'Action', ref: 'remove', props: { area: 'remove', ink: 'ink', label: 'Delete it' } },
      { if: '$.error', then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] } },
    ],
  },
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: questionOne.fingerprint, context: { questionId: { $ref: '$.questionId' } } }, target: 'question' },
    save: { url: '/api/vex', method: 'POST', request: { fingerprint: questionEdit.fingerprint, context: { questionId: { $ref: '$.questionId' }, text: { $ref: '$.draft' } } }, errorTarget: 'error' },
    remove: { url: '/api/vex', method: 'POST', request: { fingerprint: questionDelete.fingerprint, context: { questionId: { $ref: '$.questionId' } } }, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'draft', value: '$.question.text' }] }] },
  triggers: [
    { event: 'ui:click', ref: 'save', do: [{ set: 'error', value: '' }, { call: 'save', onSuccess: [{ pop: true }] }] },
    { event: 'ui:key', ref: 'draft', key: 'Enter', do: [{ set: 'error', value: '' }, { call: 'save', onSuccess: [{ pop: true }] }] },
    { event: 'ui:click', ref: 'remove', do: [{ set: 'error', value: '' }, { call: 'remove', onSuccess: [{ pop: true }] }] },
  ],
};

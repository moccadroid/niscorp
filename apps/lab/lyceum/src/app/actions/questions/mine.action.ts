import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { questionsMine } from '@lyceum/app/vex/question.entries';

// YOUR QUESTIONS — the ones this person sent, newest first; nobody else's
// (the read is pinned to them, vex/behaviors.ts). A reactive read: sent, edited
// or deleted, the list follows. Pressed, a question opens over the screen to
// edit or delete (questions.edit).
export const questionsMineAction: ActionDefinition = {
  id: 'questions.mine',
  description: 'The questions this person has sent the speaker, newest first; pressing one opens it to edit or delete. Shows; changes nothing.',
  title: 'Your questions',
  data: { questions: [] },
  // Openable by anybody who holds it — a tab, the assistant — with nothing to
  // pre-fill: its contract is empty, and declared (rule 14).
  input: z.toJSONSchema(z.object({})),
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'list'] },
    children: [
      { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'Your questions · press one to edit or delete it' }] },
      {
        component: 'Cell',
        props: { area: 'list', pad: 'none' },
        children: [
          {
            component: 'Rows',
            props: {
              rows: '$.questions',
              rowKey: 'question_id',
              rowRef: 'pick',
              empty: 'You have not sent any.',
              columns: [{ label: '', key: 'text', w: 1 }],
            },
          },
        ],
      },
    ],
  },
  endpoints: {
    questions: { url: '/api/vex', method: 'POST', request: { fingerprint: questionsMine.fingerprint, context: {} }, target: 'questions' },
  },
  lifecycle: { mount: [{ call: 'questions' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick',
      do: [{ push: { action: 'questions.edit', canvas: 'overlay', with: ['sheet'], input: { questionId: '@event.payload', sheetTitle: 'Your question' } } }],
    },
  ],
};

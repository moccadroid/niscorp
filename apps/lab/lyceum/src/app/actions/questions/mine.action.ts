import type { ActionDefinition } from '@niscorp/nova';
import { questionsMine } from '@lyceum/app/vex/question.entries';

// YOUR QUESTIONS — the ones this person sent, newest first; nobody else's
// (the read is pinned to them, vex/behaviors.ts). A reactive read: sent, edited
// or deleted, the list follows. Pressed, a question opens over the screen to
// edit or delete (questions.edit).
export const questionsMineAction: ActionDefinition = {
  id: 'questions.mine',
  title: 'Your questions',
  data: { questions: [] },
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

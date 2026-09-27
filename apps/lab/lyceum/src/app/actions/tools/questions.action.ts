import type { ActionDefinition } from '@niscorp/nova';
import { questionsAll } from '@lyceum/app/vex/question.entries';

// The controller's Q&A: every question the room sent, newest first, with its
// sender. A reactive read — a question sent arrives on its own.
export const questionsTool: ActionDefinition = {
  id: 'tools.questions',
  title: 'Questions',
  data: { questions: [] },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'list'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'alert' }, children: [{ component: 'Label', children: 'Questions from the room' }] },
      {
        component: 'Cell',
        props: { area: 'list', pad: 'none', scroll: 'y' },
        children: [
          {
            component: 'Rows',
            props: {
              rows: '$.questions',
              rowKey: 'question_id',
              empty: 'No questions yet.',
              columns: [
                { label: 'Question', key: 'text', w: 3 },
                { label: 'From', key: 'sender', w: 1 },
              ],
            },
          },
        ],
      },
    ],
  },
  endpoints: {
    questions: { url: '/api/vex', method: 'POST', request: { fingerprint: questionsAll.fingerprint, context: {} }, target: 'questions' },
  },
  lifecycle: { mount: [{ call: 'questions' }] },
  triggers: [],
};

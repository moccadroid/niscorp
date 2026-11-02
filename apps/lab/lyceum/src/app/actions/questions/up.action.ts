import type { ActionDefinition } from '@niscorp/nova';
import { questionMineOnScreen, questionOnScreen } from '@lyceum/app/vex/question.entries';

// On the phone of whoever asked the question the speaker put up last.
export const upAction: ActionDefinition = {
  id: 'questions.up',
  title: 'Your question is up',
  data: { onScreen: [], mine: [] },
  // Prism reads a list's first item as `[0]`; a path it can't find throws, so both are there before it compares.
  layout: {
    if: '$.mine.0.question_id',
    then: {
      if: '$.onScreen.0.question_id',
      then: {
        if: { $prism: { $eq: [{ $ref: '$.onScreen[0].question_id' }, { $ref: '$.mine[0].question_id' }] } },
        then: { component: 'Sheet', props: { areas: ['up'] }, children: [{ component: 'Cell', props: { area: 'up', ink: 'signal' }, children: [{ component: 'Headline', props: { level: 'title' }, children: 'Your question is on the screen.' }] }] },
      },
    },
  },
  endpoints: {
    onScreen: { url: '/api/vex', method: 'POST', request: { fingerprint: questionOnScreen.fingerprint, context: {} }, target: 'onScreen' },
    mine: { url: '/api/vex', method: 'POST', request: { fingerprint: questionMineOnScreen.fingerprint, context: {} }, target: 'mine' },
  },
  lifecycle: { mount: [{ call: 'onScreen' }, { call: 'mine' }] },
  triggers: [],
};

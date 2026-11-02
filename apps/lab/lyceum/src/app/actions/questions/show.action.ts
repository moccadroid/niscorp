import type { ActionDefinition } from '@niscorp/nova';
import { questionOnScreen, questionShow, questionsShown } from '@lyceum/app/vex/question.entries';

// The speaker's side of the Q&A slide: every question the moderator found fit,
// and one press puts it on the projector.
export const showTool: ActionDefinition = {
  id: 'tools.questions-show',
  title: 'Put a question on the screen',
  data: { fit: [], onScreen: [], picked: '', error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'now', 'list'], rows: ['auto', 'auto', 1] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Put a question on the screen' }] },
      {
        if: '$.onScreen.0.text',
        then: { component: 'Cell', props: { area: 'now', ink: 'signal' }, children: [{ component: 'Text', children: 'On the screen: {{$.onScreen.0.text}}' }] },
        else: { component: 'Cell', props: { area: 'now', mark: 'hatch' }, children: [{ component: 'Text', children: 'Nothing on the screen yet.' }] },
      },
      {
        component: 'Cell',
        props: { area: 'list', scroll: 'y' },
        children: [
          { component: 'Rows', props: { rows: '$.fit', rowKey: 'question_id', rowRef: 'show', empty: 'No questions yet.', columns: [{ label: 'Fit to show — press one', key: 'text' }] } },
          { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } },
        ],
      },
    ],
  },
  endpoints: {
    fit: { url: '/api/vex', method: 'POST', request: { fingerprint: questionsShown.fingerprint, context: {} }, target: 'fit' },
    onScreen: { url: '/api/vex', method: 'POST', request: { fingerprint: questionOnScreen.fingerprint, context: {} }, target: 'onScreen' },
    show: { url: '/api/vex', method: 'POST', request: { fingerprint: questionShow.fingerprint, context: { question_id: { $ref: '$.picked' } } }, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'fit' }, { call: 'onScreen' }] },
  triggers: [{ event: 'ui:click', ref: 'show', do: [{ set: 'error', value: '' }, { set: 'picked', value: '@event.payload' }, { call: 'show' }] }],
};

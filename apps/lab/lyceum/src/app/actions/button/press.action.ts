import type { ActionDefinition } from '@niscorp/nova';
import { pressSend } from '@lyceum/app/vex/press.entries';

export const buttonPressAction: ActionDefinition = {
  id: 'button.press',
  title: 'The button',
  data: { error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'press', 'out'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'alert' }, children: [{ component: 'Label', children: 'Only three of you have this' }] },
      { component: 'Action', ref: 'press', props: { area: 'press', ink: 'alert', size: 'large', label: 'Press', sound: 'chime' } },
      { if: '$.error', then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] } },
    ],
  },
  endpoints: {
    press: { url: '/api/vex', method: 'POST', request: { fingerprint: pressSend.fingerprint, context: {} }, errorTarget: 'error' },
  },
  triggers: [{ event: 'ui:click', ref: 'press', do: [{ set: 'error', value: '' }, { call: 'press' }] }],
};

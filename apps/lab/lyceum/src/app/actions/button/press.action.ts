import type { ActionDefinition } from '@niscorp/nova';
import { pressSend } from '@lyceum/app/vex/press.entries';

// THE BUTTON — an action only some people have. The speaker gives it to three
// people (tools/button.action.ts): a grant row each, and it is a block on
// their phone's list (server/phone.ts). On everybody else's phone it is not
// hidden; it was never sent. Pressed, it plays a sound where it is pressed
// (the kit's `sound`) and writes a press, which the stage shows.
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

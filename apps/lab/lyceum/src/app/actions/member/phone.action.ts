import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { phoneLayout } from './phone.layout';

// THE PHONE — what everybody who joined has. The name they chose across the
// top, and under it a LIST canvas (`body`): the actions this person holds, one
// under another, each as tall as it is.
//
// What is on the list is what they hold, in the phone's order, derived when
// their shell is built (server/phone.ts): the assistant; every integration the
// speaker installed and approved (`ext.member.*`, Acme's Q&A); the X-ray once
// given. A grant or an install rebuilds the shell, and the list follows — so
// through the talk, things arrive on everybody's phone as they are given.
//
// An id tapped on the X-rayed screen opens that action, as the JSON document it
// is, over the screen: the browser says which instance.
export const phoneAction: ActionDefinition = {
  id: 'member.phone',
  title: 'Your phone',
  data: { me: { member_id: '', name: '' }, stack: [] },
  layout: phoneLayout,
  endpoints: {
    me: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
  },
  lifecycle: {
    mount: [{ call: 'me' }, { reconcile: { canvas: 'body', to: '$.stack', action: 'action', own: 'canvas' } }],
  },
  triggers: [
    {
      message: 'xray-open',
      do: [{ push: { action: 'xray.document', canvas: 'overlay', with: ['sheet'], input: { instanceId: '@event.payload.instance', sheetTitle: '@event.payload.action' } } }],
    },
  ],
};

import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { phoneLayout } from './phone.layout';

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

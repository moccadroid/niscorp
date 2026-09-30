import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { phoneLayout } from './phone.layout';

// THE PHONE — what everybody who joined has. Their name across the top, read
// reactively (it is written by a model while they watch); under it the body
// and the tabs, two canvases it places. The tabs are a list canvas nobody
// authors: the
// manifest's `seeds` put on it every action the person is granted that can
// render as a tab (server/seeds.ts). A grant that changes rebuilds the shell,
// and the bar follows.
export const phoneAction: ActionDefinition = {
  id: 'member.phone',
  title: 'Your phone',
  data: { me: { member_id: '', name: '', title: '', quirk: '' } },
  layout: phoneLayout,
  endpoints: {
    me: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
  },
  lifecycle: { mount: [{ call: 'me' }] },
  triggers: [],
};

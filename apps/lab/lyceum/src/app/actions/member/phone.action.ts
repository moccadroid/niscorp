import type { ActionDefinition } from '@niscorp/nova';
import { phoneLayout } from './phone.layout';

// THE PHONE — what everybody who joined has. Its own layout places three
// canvases and nothing else. The tabs are a list canvas nobody authors: the
// manifest's `seeds` put on it every action the person is granted that can
// render as a tab (server/seeds.ts). A grant that changes rebuilds the shell,
// and the bar follows.
export const phoneAction: ActionDefinition = {
  id: 'member.phone',
  title: 'Your phone',
  data: {},
  layout: phoneLayout,
  triggers: [],
};

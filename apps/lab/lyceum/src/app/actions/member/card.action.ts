import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { cardLayout } from './card.layout';

// Who you are in the room. Held by everybody who has stepped in, sorted or
// not; the house line reads the same row the identity seam does.
export const cardAction: ActionDefinition = {
  id: 'member.card',
  title: 'You',
  data: { me: { name: '', house_id: '', house_name: '' }, loading: true },
  layout: cardLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [],
};

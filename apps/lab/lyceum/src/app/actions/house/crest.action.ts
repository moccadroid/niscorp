import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { crestLayout } from './crest.layout';

// Exists only for the sorted. An unsorted member's shell has no definition for
// it — not hidden, absent — so its canvas stays empty until the sorting writes
// their house and their shell is rebuilt from the new role.
export const crestAction: ActionDefinition = {
  id: 'house.crest',
  title: 'Your house',
  data: { me: { name: '', house_id: '', house_name: '' } },
  layout: crestLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [],
};

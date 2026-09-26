import type { ActionDefinition } from '@niscorp/nova';
import { memberRoster } from '@lyceum/app/vex/member.entries';
import { rosterLayout } from './roster.layout';

// The projector's view of the room. Its read is reactive: when the members
// change — somebody stepped in, somebody was sorted — the new rows arrive on
// their own.
export const rosterAction: ActionDefinition = {
  id: 'stage.roster',
  title: 'The room',
  data: { rows: [] },
  layout: rosterLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberRoster.fingerprint, context: {} }, target: 'rows' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [],
};

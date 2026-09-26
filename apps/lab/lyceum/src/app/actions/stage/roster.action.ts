import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts, memberRoster } from '@lyceum/app/vex/member.entries';
import { rosterLayout } from './roster.layout';

// The projector's view of the room. Its read is reactive: when the members
// change — somebody stepped in, somebody was sorted — the new rows arrive on
// their own.
export const rosterAction: ActionDefinition = {
  id: 'stage.roster',
  title: 'The room',
  data: { rows: [], counts: { joined: 0, sorted: 0, unsorted: 0 } },
  layout: rosterLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberRoster.fingerprint, context: {} }, target: 'rows' },
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
  },
  lifecycle: { mount: [{ call: 'load' }, { call: 'counts' }] },
  triggers: [],
};

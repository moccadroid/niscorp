import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts, memberRegister } from '@lyceum/app/vex/member.entries';
import { registerLayout } from './register.layout';

// The register, as a slide: everybody who stepped in. Its reads are reactive:
// when somebody steps in, is assigned or changes their name, the new rows
// arrive on their own.
export const stageRegisterAction: ActionDefinition = {
  id: 'stage.register',
  title: 'The register',
  data: { rows: [], counts: { joined: 0, assigned: 0, unassigned: 0 } },
  layout: registerLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberRegister.fingerprint, context: {} }, target: 'rows' },
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
  },
  lifecycle: { mount: [{ call: 'load' }, { call: 'counts' }] },
  triggers: [],
};

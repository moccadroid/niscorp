import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts, memberRegister } from '@lyceum/app/vex/member.entries';
import { registerLayout } from './register.layout';

export const stageRegisterAction: ActionDefinition = {
  id: 'stage.register',
  title: 'The register',
  data: { rows: [], counts: { joined: 0 }, address: { url: '', host: '' } },
  layout: registerLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberRegister.fingerprint, context: {} }, target: 'rows' },
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    address: { fn: 'room.address', target: 'address' },
  },
  lifecycle: { mount: [{ call: 'load' }, { call: 'counts' }, { call: 'address' }] },
  triggers: [],
};

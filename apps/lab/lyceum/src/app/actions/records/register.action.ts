import type { ActionDefinition } from '@niscorp/nova';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { registerLayout } from './register.layout';

// RECORDS' clearance: the register — everybody in the room, on your phone, as
// it changes. The other departments are not granted it; on their phones it is
// not hidden, it is not there.
export const registerAction: ActionDefinition = {
  id: 'records.register',
  title: 'The register',
  data: { rows: [] },
  layout: registerLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberRegister.fingerprint, context: {} }, target: 'rows' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [],
};

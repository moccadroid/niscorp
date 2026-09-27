import type { ActionDefinition } from '@niscorp/nova';
import { TAB_BUTTON, TAB_INPUT, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { registerLayout } from './register.layout';

// RECORDS' clearance: the register — everybody in the room, on your phone, as
// it changes. The other departments are not granted it; on their phones it is
// not hidden, it is not there.
export const registerAction: ActionDefinition = {
  id: 'records.register',
  description: 'The register: everybody in the room, with job title and department, as they arrive. Records only. Shows; changes nothing.',
  title: 'The register',
  data: { tab: false, tabLabel: 'Register', tabInk: 'paper', nextInk: 'paper', rows: [] },
  input: TAB_INPUT,
  layout: { if: '$.tab', then: TAB_BUTTON, else: registerLayout },
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberRegister.fingerprint, context: {} }, target: 'rows' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'records.register', canvas: 'body' } }] },
    TAB_OPENED,
  ],
};

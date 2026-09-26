import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { badgeLayout } from './badge.layout';

// Your department, on top of your phone. Only the assigned are granted it — for
// everybody else it does not exist, so its canvas is empty until the
// assignment writes their department and their shell is rebuilt.
export const badgeAction: ActionDefinition = {
  id: 'department.badge',
  title: 'Your department',
  data: { me: { member_id: '', name: '', title: '', quirk: '', department_id: '', department_name: '', department_remit: '', department_mark: '', department_sigil: '' } },
  layout: badgeLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [],
};

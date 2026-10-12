import type { ActionDefinition } from '@niscorp/nova';
import { staffChromeLayout } from './staff.layout';

export const staffChromeAction: ActionDefinition = {
  id: 'chrome.staff',
  data: {
    propertyId: '',
    staffId: '',
    propertyName: '',
    accent: '',
    staffName: '',
    job: '',
    audience: '',
    sibling: {},
    mark: {},
    unread: {},
  },
  layout: staffChromeLayout,
  endpoints: {
    leave: { fn: 'auth.leave' },
    switchProperty: { fn: 'auth.switchProperty' },
    loadMark: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'seen/last', context: { topic: 'messages' } },
      target: 'mark',
    },
    loadUnread: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'messages/unreadForDesk',
        context: { since: { $ref: '$.mark.last' } },
      },
      target: 'unread',
    },
  },
  lifecycle: { mount: [{ call: 'loadMark', onSuccess: [{ call: 'loadUnread' }] }] },
  triggers: [
    { event: 'ui:click', ref: 'leave', do: [{ call: 'leave' }] },
    {
      event: 'ui:click',
      ref: 'settings',
      do: [{ resetTo: { action: 'staff.settings.form', canvas: 'sheet', with: ['sheet'], input: { sheetTitle: 'Your screen', staffId: '$.staffId' } } }],
    },
    {
      message: 'messages-changed',
      do: [{ call: 'loadMark', onSuccess: [{ call: 'loadUnread' }] }],
    },
    { event: 'ui:click', ref: 'switch-property', do: [{ call: 'switchProperty' }] },
  ],
};

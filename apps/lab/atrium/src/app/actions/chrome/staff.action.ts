import type { ActionDefinition } from '@niscorp/nova';
import { staffChromeLayout } from './staff.layout';

// The staff chrome — one top bar for the desk, the service floor, operations
// and the vendor console.
//
// It used to be the navigator, and that was the mistake: eleven authored nav
// edges plus eleven booleans derived from the granted ids, next to a strip of
// slots discovered from rows. Two mechanisms for one thing, and the authored
// half could never learn about an integration that shipped after it was
// written. Both are gone. The crew's surface is the composed `home` canvas,
// seeded from the resolved slots (see the manifest's `seeds` hook), so a
// go-live grows the working screen with no layout anywhere to edit.
//
// What is left is chrome in the strict sense: which house, who you are, the
// unread count for the shift, the switch to your other property, and Leave.
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
    // Henrik's other house — a server-side re-grant, same gesture as login.
    switchProperty: { fn: 'auth.switchProperty' },
    // Unread, computed on read: my latest mark, then everything newer. A login
    // mounts this chrome, so the badge is simply THERE when the shift starts.
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
    // Onto `sheet`, not `aside`: it is a thing you open, change and close, and
    // it has nothing to do with the work underneath it. `resetTo` so pressing
    // the control twice leaves one.
    {
      event: 'ui:click',
      ref: 'settings',
      do: [{ resetTo: { action: 'staff.settings.form', canvas: 'sheet', with: ['sheet'], input: { sheetTitle: 'Your screen', staffId: '$.staffId' } } }],
    },
    // Anything message-shaped happened in this shell — re-count.
    {
      message: 'messages-changed',
      do: [{ call: 'loadMark', onSuccess: [{ call: 'loadUnread' }] }],
    },
    // Henrik's other house — the shell rebuilds as the sibling principal, the
    // same way login builds it. Anything less would be a permission flag.
    { event: 'ui:click', ref: 'switch-property', do: [{ call: 'switchProperty' }] },
  ],
};

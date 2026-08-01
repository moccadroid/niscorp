import type { ActionDefinition } from '@niscorp/nova';
import { guestChromeLayout } from './guest.layout';

// The guest's chrome. Deliberately almost nothing: the property's name, who you
// are, and a way out. A guest surface that grows a navigation bar has stopped
// being a guest surface.
//
// Everything here is boot input seeded from the session's principal, so the
// chrome needs no reads of its own and renders on the first frame.
export const guestChromeAction: ActionDefinition = {
  id: 'chrome.guest',
  data: { propertyName: '', accent: '', guestName: '' },
  layout: guestChromeLayout,
  endpoints: { leave: { fn: 'auth.leave' } },
  triggers: [{ event: 'ui:click', ref: 'leave', do: [{ call: 'leave' }] }],
};

import type { ActionDefinition } from '@niscorp/nova';
import { guestChromeLayout } from './guest.layout';

export const guestChromeAction: ActionDefinition = {
  id: 'chrome.guest',
  data: { propertyName: '', accent: '', guestName: '' },
  layout: guestChromeLayout,
  endpoints: { leave: { fn: 'auth.leave' } },
  triggers: [{ event: 'ui:click', ref: 'leave', do: [{ call: 'leave' }] }],
};

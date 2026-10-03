import type { ActionDefinition } from '@niscorp/nova';
import { welcomeLayout } from './welcome.layout';

// The first action: data with defaults, a JSON layout, and one trigger. The
// press is counted in the shell on the server — the browser only draws what
// the socket sends and sends back what was pressed.
export const welcomeAction: ActionDefinition = {
  id: 'welcome',
  title: 'Welcome',
  data: { name: 'nisc-template-moss-dom', presses: 0 },
  layout: welcomeLayout,
  triggers: [{ event: 'ui:click', ref: 'press', do: [{ increment: 'presses' }] }],
};

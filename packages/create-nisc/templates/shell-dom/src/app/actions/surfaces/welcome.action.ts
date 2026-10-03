import type { ActionDefinition } from '@niscorp/nova';
import { welcomeLayout } from './welcome.layout';

// The first action: data with defaults, a JSON layout, and one trigger. The
// press is counted in the shell — which lives in this page, with no server.
export const welcomeAction: ActionDefinition = {
  id: 'welcome',
  title: 'Welcome',
  data: { name: 'nisc-template-shell-dom', presses: 0 },
  layout: welcomeLayout,
  triggers: [{ event: 'ui:click', ref: 'press', do: [{ increment: 'presses' }] }],
};

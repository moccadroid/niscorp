import type { ActionDefinition } from '@niscorp/nova';
import { welcomeLayout } from './welcome.layout';

export const welcomeAction: ActionDefinition = {
  id: 'welcome',
  title: 'Welcome',
  data: { name: 'nisc-template-moss-react', presses: 0 },
  layout: welcomeLayout,
  triggers: [{ event: 'ui:click', ref: 'press', do: [{ increment: 'presses' }] }],
};

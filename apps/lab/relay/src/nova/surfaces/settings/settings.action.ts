import type { ActionDefinition } from '@niscorp/nova';
import { settingsLayout } from './settings.layout';

// The settings screen. No query — its data is the settings record itself, edited
// in place via the form `model:` bindings. Persisting is a mutations-phase
// concern; for now the controls are live but local.
export const settingsAction: ActionDefinition = {
  id: 'settings',
  title: 'Settings',
  data: {
    settings: {
      name: 'Alex Morgan',
      email: 'alex@relay.io',
      role: 'owner',
      emailNotif: true,
      taskReminders: true,
      dealUpdates: false,
      weeklyDigest: true,
      pipeline: 'sales',
      autoAssign: false,
      compact: false,
    },
  },
  layout: settingsLayout,
};

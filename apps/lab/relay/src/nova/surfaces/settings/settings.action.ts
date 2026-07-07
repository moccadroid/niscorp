import { z } from 'zod';
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
    // Ray's debug toggle — unlike the (still-local) settings above, this one
    // persists: loaded from localStorage on mount, saved on change.
    rayDebug: false,
    // Estimated localStorage Ray is using (loaded on mount, refreshed on clear).
    rayStorage: '',
  },
  layout: settingsLayout,
  endpoints: {
    loadDebug: { fn: 'ray.getDebug', target: 'rayDebug' },
    saveDebug: { fn: 'ray.setDebug' },
    storageSize: { fn: 'ray.storageSize', target: 'rayStorage' },
    clearSessions: { fn: 'ray.clearSessions' },
  },
  lifecycle: { mount: [{ call: 'loadDebug' }, { call: 'storageSize' }] },
  triggers: [
    { event: 'ui:model', ref: 'ray-debug', do: [{ set: 'rayDebug', value: '@event.payload' }, { call: 'saveDebug' }] },
    // Clear chat sessions → confirm in the shared dialog → wipe → refresh the size.
    {
      event: 'ui:click',
      ref: 'ray-clear-sessions',
      do: [{ push: { action: 'confirm-delete', canvas: 'modal', with: ['panel'], input: { label: 'all chat sessions', message: 'This permanently deletes every Ray conversation. This can’t be undone.' } } }],
    },
    { message: 'confirm-delete', do: [{ call: 'clearSessions', onSuccess: [{ call: 'storageSize' }] }] },
  ],
};

// Settable inputs an opener may pass — authored in zod, exported as JSON Schema.
export const settingsInputSchema = z.toJSONSchema(z.object({}));

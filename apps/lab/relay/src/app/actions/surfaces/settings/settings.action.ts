import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { settingsLayout } from './settings.layout';

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
    rayDebug: false,
    rayStorage: '',
    // Server state, not a personal preference: every session runs on what is
    // set here.
    models: { options: [], assignments: {}, efforts: {} },
    devtools: false,
  },
  layout: settingsLayout,
  endpoints: {
    loadDebug: { fn: 'ray.getDebug', target: 'rayDebug' },
    saveDebug: { fn: 'ray.setDebug' },
    storageSize: { fn: 'ray.storageSize', target: 'rayStorage' },
    clearSessions: { fn: 'ray.clearSessions' },
    loadModels: { fn: 'models.load', target: 'models' },
    saveModels: { fn: 'models.assign', target: 'models' },
    dtState: { fn: 'devtools.enabled', target: 'devtools' },
    dtSet: { fn: 'devtools.setEnabled' },
  },
  lifecycle: {
    mount: [{ call: 'loadDebug' }, { call: 'storageSize' }, { call: 'loadModels' }, { call: 'dtState' }],
  },
  triggers: [
    { event: 'ui:model', ref: 'ray-debug', do: [{ set: 'rayDebug', value: '@event.payload' }, { call: 'saveDebug' }] },
    { event: 'ui:model', ref: 'model-chat', do: [{ set: 'models.assignments.chat.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-layout', do: [{ set: 'models.assignments.layout.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-architect', do: [{ set: 'models.assignments.architect.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-query', do: [{ set: 'models.assignments.query.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-shape', do: [{ set: 'models.assignments.shape.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-chat', do: [{ set: 'models.assignments.chat.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-layout', do: [{ set: 'models.assignments.layout.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-architect', do: [{ set: 'models.assignments.architect.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-query', do: [{ set: 'models.assignments.query.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-shape', do: [{ set: 'models.assignments.shape.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'devtools-toggle', do: [{ set: 'devtools', value: '@event.payload' }, { call: 'dtSet' }] },
    {
      event: 'ui:click',
      ref: 'ray-clear-sessions',
      do: [{ push: { action: 'confirm-delete', canvas: 'modal', with: ['panel'], input: { label: 'all chat sessions', message: 'This permanently deletes every Ray conversation. This can’t be undone.' } } }],
    },
    { message: 'confirm-delete', do: [{ call: 'clearSessions', onSuccess: [{ call: 'storageSize' }] }] },
  ],
};

export const settingsInputSchema = z.toJSONSchema(z.object({}));

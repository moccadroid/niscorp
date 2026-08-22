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
    // Ray's debug toggle — a per-principal preference in the server-side
    // session store: loaded on mount, saved on change.
    rayDebug: false,
    // Estimated server storage this principal's chat history uses.
    rayStorage: '',
    // Which model each agent runs on and how hard it thinks there, plus the
    // rosters to choose from — all served by the server (its LLM seam owns
    // them). SERVER state, not a personal preference: everyone's sessions run
    // on what is set here. `efforts` is keyed by role because the legal rungs
    // depend on the model that row is currently on.
    models: { options: [], assignments: {}, efforts: {} },
    // Devtools on/off — reflects whether the dock is mounted on its canvas.
    // Only rendered in the ring-2 dev variant of this screen; the endpoints are
    // no-ops for a non-dev (who doesn't hold the dock).
    devtools: false,
  },
  layout: settingsLayout,
  endpoints: {
    loadDebug: { fn: 'ray.getDebug', target: 'rayDebug' },
    saveDebug: { fn: 'ray.setDebug' },
    storageSize: { fn: 'ray.storageSize', target: 'rayStorage' },
    clearSessions: { fn: 'ray.clearSessions' },
    loadModels: { fn: 'models.load', target: 'models' },
    // Sends the whole edited map and targets `models` with what actually took —
    // a refused choice, or an effort the new model doesn't offer, redraws as
    // the server's answer rather than the screen's wish.
    saveModels: { fn: 'models.assign', target: 'models' },
    dtState: { fn: 'devtools.enabled', target: 'devtools' },
    dtSet: { fn: 'devtools.setEnabled' },
  },
  lifecycle: {
    mount: [{ call: 'loadDebug' }, { call: 'storageSize' }, { call: 'loadModels' }, { call: 'dtState' }],
  },
  triggers: [
    { event: 'ui:model', ref: 'ray-debug', do: [{ set: 'rayDebug', value: '@event.payload' }, { call: 'saveDebug' }] },
    // Models: write the row into the local copy FIRST, then save the copy —
    // the explicit `set` is what guarantees the fn sees the new value and not
    // the one it is replacing. Changing a model re-saves the effort too; the
    // server clamps it to a rung that model offers and sends back the truth.
    { event: 'ui:model', ref: 'model-chat', do: [{ set: 'models.assignments.chat.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-layout', do: [{ set: 'models.assignments.layout.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-architect', do: [{ set: 'models.assignments.architect.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-validator', do: [{ set: 'models.assignments.validator.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-mapping', do: [{ set: 'models.assignments.mapping.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-query', do: [{ set: 'models.assignments.query.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'model-shape', do: [{ set: 'models.assignments.shape.model', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-chat', do: [{ set: 'models.assignments.chat.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-layout', do: [{ set: 'models.assignments.layout.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-architect', do: [{ set: 'models.assignments.architect.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-validator', do: [{ set: 'models.assignments.validator.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-mapping', do: [{ set: 'models.assignments.mapping.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-query', do: [{ set: 'models.assignments.query.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    { event: 'ui:model', ref: 'effort-shape', do: [{ set: 'models.assignments.shape.effort', value: '@event.payload' }, { call: 'saveModels' }] },
    // Developer tools: flip the dock on its canvas (mount/unmount via the fn).
    { event: 'ui:model', ref: 'devtools-toggle', do: [{ set: 'devtools', value: '@event.payload' }, { call: 'dtSet' }] },
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

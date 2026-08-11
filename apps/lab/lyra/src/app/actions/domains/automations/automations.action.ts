import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { automationsLayout } from './automations.layout';
import { automationCreate, automationUpdate, notificationsRecent } from '@lyra/app/vex/tide.entries';

// The messages ARE ordinary rows, so they are an ordinary vex read. Only the
// ledger goes through `fn:`, and only because it lives in a memory store —
// see server/functions/automations.ts.
const notificationsPrism = { fingerprint: notificationsRecent.fingerprint, context: {} };
const createPrism = {
  fingerprint: automationCreate.fingerprint,
  context: { template: { $ref: '$.template' }, runAt: { $ref: '$.runAt' }, trialDays: { $ref: '$.trialDays' } },
};
const updatePrism = {
  fingerprint: automationUpdate.fingerprint,
  context: { automationId: { $ref: '$.automationId' }, runAt: { $ref: '$.runAt' }, trialDays: { $ref: '$.trialDays' }, enabled: { $ref: '$.enabled' } },
};

// AUTOMATIONS, VISIBLE.
//
// Manager and up. An automation changes memberships overnight, so who may see
// and pause one is the same question as who may set a price.
//
// `studioId` is seeded from the session (see app.ts `inputs`) and passed to
// every fn, which uses it to filter reflex ids. That is the one boundary in
// this application not enforced by the engine — the ledger is not in the
// database the engine guards — so it is checked in one place and asserted.
export const automationsAction: ActionDefinition = {
  id: 'automations.list',
  title: 'Automations',
  data: {
    reflexes: [],
    notifications: [],
    loading: true,
    reflexId: '',
    previewOpen: false,
    previewName: '',
    previewSummary: '',
    previewUnits: [],
    previewResult: {},
    armOn: true,
    error: '',
    notice: '',
  },
  layout: automationsLayout,
  endpoints: {
    load: { fn: 'automations.overview', target: 'reflexes', errorTarget: 'error' },
    messages: { url: '/api/automation/vex', method: 'POST', request: notificationsPrism, target: 'notifications' },
    preview: { fn: 'automations.preview', target: 'previewResult', errorTarget: 'error' },
    run: { fn: 'automations.run', errorTarget: 'error' },
    setArm: { fn: 'automations.arm', errorTarget: 'error' },
    create: { url: '/api/automation/vex', method: 'POST', request: createPrism, errorTarget: 'error' },
    update: { url: '/api/automation/vex', method: 'POST', request: updatePrism, errorTarget: 'error' },
    // Rows changed, so the loaded reflexes are stale. Re-reading them is what
    // makes an edit take effect with no release and no restart — the whole
    // reason a reflex is a row.
    reload: { fn: 'automations.reload' },
  },
  lifecycle: {
    // The list stopped fetching the picklist when there stopped being one:
    // the vocabularies belong to the FORM, which is what asks about them.
    mount: [{ call: 'messages' }, { call: 'load', onSuccess: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    // OPEN THE FORM, do not become it. See plans.form.ts.
    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'automations.form', canvas: 'sheet', with: ['sheet'], input: { heading: 'Add an automation' } } }] },
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'automations.form',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              heading: 'Change an automation',
              automationId: '@event.payload.automation_id',
              audience: '@event.payload.audience',
              effect: '@event.payload.effect',
              subject: '@event.payload.subject',
              body: '@event.payload.body',
              runAt: '@event.payload.run_at',
              trialDays: '@event.payload.trial_days',
              enabled: '@event.payload.enabled',
            },
          },
        },
      ],
    },
    // The form announces; this reloads all three views of the same fact — what
    // is set up, what tide holds, and what it has done.
    // RELOAD then re-read: a new row is not an automation until tide holds it,
    // and the list now shows the difference ('Not loaded') rather than claiming
    // everything configured is armed.
    { message: 'automations-changed', do: [{ call: 'reload' }, { call: 'load' }] },
    {
      event: 'ui:click',
      ref: 'preview',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'reflexId', value: '@event.payload.reflex_id' },
        { set: 'previewName', value: '@event.payload.intent' },
        {
          call: 'preview',
          onSuccess: [
            { set: 'previewOpen', value: true },
            { set: 'previewSummary', value: '$.previewResult.summary' },
            { set: 'previewUnits', value: '$.previewResult.units' },
          ],
        },
      ],
    },
    { event: 'ui:click', ref: 'closePreview', do: [{ set: 'previewOpen', value: false }] },
    {
      event: 'ui:click',
      ref: 'run',
      do: [
        { set: 'error', value: '' },
        { set: 'reflexId', value: '@event.payload.reflex_id' },
        {
          call: 'run',
          onSuccess: [{ set: 'notice', value: 'Ran it. Anything it did is below.' }, { call: 'load' }, { call: 'messages' }],
        },
      ],
    },
    // Pause and arm are the same call with the flag flipped, held as data so
    // the layout branches on a value rather than on which button was pressed.
    {
      event: 'ui:click',
      ref: 'pause',
      do: [{ set: 'reflexId', value: '@event.payload.reflex_id' }, { set: 'armOn', value: false }, { call: 'setArm', onSuccess: [{ set: 'notice', value: 'Paused. The clock will not fire it; you still can.' }, { call: 'load' }] }],
    },
    {
      event: 'ui:click',
      ref: 'arm',
      do: [{ set: 'reflexId', value: '@event.payload.reflex_id' }, { set: 'armOn', value: true }, { call: 'setArm', onSuccess: [{ set: 'notice', value: 'Armed.' }, { call: 'load' }] }],
    },
  ],
};

export const automationsInputSchema = z.toJSONSchema(
  z.object({
    studioId: z.string().optional().describe('Seeded from the session, never client-authored — it is what scopes the ledger.'),
  }),
);

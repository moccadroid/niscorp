import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { automationsLayout } from './automations.layout';
import { automationRecipes, automationsList, outboxRecent } from '@lyra/app/vex/tide.entries';

const outboxPrism = { fingerprint: outboxRecent.fingerprint, context: {} };
// Both screens are QUERIES now. The cards, their sentences, their state words
// and how each one last ran all come out of one entry, scoped by the engine —
// the two hand-written SELECTs and the JS that captioned them are gone.
const listPrism = { fingerprint: automationsList.fingerprint, context: {} };
const recipesPrism = { fingerprint: automationRecipes.fingerprint, context: {} };

export const automationsAction: ActionDefinition = {
  id: 'automations.list',
  title: 'Automations',
  data: {
    reflexes: [],
    recipes: [],
    outbox: [],
    messageId: '',
    loading: true,
    // Recipes first for a studio with nothing set up; the manifest flips it to
    // Running for one that already has some.
    view: 'recipes',
    views: [
      { value: 'recipes', label: 'Recipes', showRecipes: true, showRunning: false, showOutbox: false },
      { value: 'running', label: 'Running', showRecipes: false, showRunning: true, showOutbox: true },
    ],
    showRecipes: true,
    showRunning: false,
    showOutbox: false,
    runningHint: 'Preview one before you trust it.',
    reflexId: '',
    previewOpen: false,
    previewName: '',
    previewSummary: '',
    previewHint: '',
    previewUnits: [],
    previewAnyone: false,
    previewResult: {},
    armOn: true,
    armId: '',
    error: '',
    notice: '',
  },
  layout: automationsLayout,
  endpoints: {
    load: { url: '/api/studio/vex', method: 'POST', request: listPrism, target: 'reflexes', errorTarget: 'error' },
    recipes: { url: '/api/studio/vex', method: 'POST', request: recipesPrism, target: 'recipes', errorTarget: 'error' },
    outbox: { url: '/api/automation/vex', method: 'POST', request: outboxPrism, target: 'outbox' },
    // The studio asking its own robot to try again — see automations.sendAgain.
    sendAgain: { fn: 'automations.sendAgain', errorTarget: 'error' },
    preview: { fn: 'automations.preview', target: 'previewResult', errorTarget: 'error' },
    run: { fn: 'automations.run', errorTarget: 'error' },
    // A vex write like any other; the reflex reload rides the app's
    // `automations` reaction, so nothing here remembers to poke one.
    setArm: {
      url: '/api/studio/vex',
      method: 'POST',
      request: { fingerprint: 'automations/arm', context: { automationId: { $ref: '$.armId' }, enabled: { $ref: '$.armOn' } } },
      errorTarget: 'error',
    },
  },
  lifecycle: {
    mount: [
      { call: 'recipes' },
      { call: 'outbox' },
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'sendAgain',
      do: [
        { set: 'error', value: '' },
        { set: 'messageId', value: '@event.payload.message_id' },
        { call: 'sendAgain', onSuccess: [{ call: 'outbox' }] },
      ],
    },
    // The two faces. The option carries which panels it shows, so one trigger
    // serves both and the layout's guards are plain values.
    {
      event: 'ui:click',
      ref: 'view',
      do: [
        { set: 'view', value: '@event.payload.value' },
        { set: 'showRecipes', value: '@event.payload.showRecipes' },
        { set: 'showRunning', value: '@event.payload.showRunning' },
        { set: 'showOutbox', value: '@event.payload.showOutbox' },
      ],
    },

    {
      event: 'ui:click',
      ref: 'useRecipe',
      do: [
        {
          push: {
            action: 'automations.form',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              heading: '@event.payload.heading',
              automationId: '@event.payload.automation_id',
              moment: '@event.payload.moment',
              effect: '@event.payload.effect',
              runAt: '@event.payload.run_at',
              days: '@event.payload.days',
              subject: '@event.payload.subject',
              body: '@event.payload.body',
              momentPhrase: '@event.payload.moment_phrase',
              momentBlurb: '@event.payload.moment_blurb',
              effectPhrase: '@event.payload.effect_phrase',
              effectBlurb: '@event.payload.effect_blurb',
              watched: '@event.payload.watched',
              usesDays: '@event.payload.uses_days',
              daysLabel: '@event.payload.days_label',
              usesMessage: '@event.payload.uses_message',
              subjectLabel: '@event.payload.subject_label',
              bodyLabel: '@event.payload.body_label',
              messageHint: '@event.payload.message_hint',
            },
          },
        },
      ],
    },

    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'automations.form', canvas: 'sheet', with: ['sheet'], input: { heading: 'Build an automation' } } }] },
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
              moment: '@event.payload.moment',
              effect: '@event.payload.effect',
              subject: '@event.payload.subject',
              body: '@event.payload.body',
              runAt: '@event.payload.run_at',
              days: '@event.payload.days',
              enabled: '@event.payload.enabled',
              momentPhrase: '@event.payload.moment_phrase',
              momentBlurb: '@event.payload.moment_blurb',
              effectPhrase: '@event.payload.effect_phrase',
              effectBlurb: '@event.payload.effect_blurb',
              watched: '@event.payload.watched',
              usesDays: '@event.payload.uses_days',
              daysLabel: '@event.payload.days_label',
              usesMessage: '@event.payload.uses_message',
              subjectLabel: '@event.payload.subject_label',
              bodyLabel: '@event.payload.body_label',
              messageHint: '@event.payload.message_hint',
            },
          },
        },
      ],
    },
    { message: 'automations-changed', do: [{ call: 'load' }, { call: 'recipes' }] },

    {
      event: 'ui:click',
      ref: 'preview',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'reflexId', value: '@event.payload.reflex_id' },
        { set: 'previewName', value: '@event.payload.name' },
        {
          call: 'preview',
          onSuccess: [
            { set: 'previewOpen', value: true },
            { set: 'previewSummary', value: '$.previewResult.summary' },
            { set: 'previewHint', value: '$.previewResult.hint' },
            { set: 'previewUnits', value: '$.previewResult.units' },
            { set: 'previewAnyone', value: '$.previewResult.anyone' },
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
          onSuccess: [{ set: 'notice', value: 'Ran it. Anything it produced is on the follow-up list or in the outbox.' }, { call: 'load' }, { call: 'outbox' }],
        },
      ],
    },
    // Pause and arm are the same call with the flag flipped, held as data so
    // the layout branches on a value rather than on which button was pressed.
    {
      event: 'ui:click',
      ref: 'pause',
      do: [{ set: 'armId', value: '@event.payload.automation_id' }, { set: 'armOn', value: false }, { call: 'setArm', onSuccess: [{ set: 'notice', value: 'Paused. It will not fire on its own; you still can.' }, { call: 'load' }] }],
    },
    {
      event: 'ui:click',
      ref: 'arm',
      do: [{ set: 'armId', value: '@event.payload.automation_id' }, { set: 'armOn', value: true }, { call: 'setArm', onSuccess: [{ set: 'notice', value: 'Armed.' }, { call: 'load' }] }],
    },
  ],
};

export const automationsInputSchema = z.toJSONSchema(
  z.object({
    studioId: z.string().optional().describe('Seeded from the session, never client-authored — it is what scopes the ledger.'),
  }),
);

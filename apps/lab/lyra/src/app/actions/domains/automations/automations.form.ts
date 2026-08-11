import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { automationCreate, automationUpdate } from '@lyra/app/vex/tide.entries';

const createPrism = {
  fingerprint: automationCreate.fingerprint,
  context: {
    audience: { $ref: '$.audience' },
    effect: { $ref: '$.effect' },
    runAt: { $ref: '$.runAt' },
    trialDays: { $ref: '$.trialDays' },
    subject: { $ref: '$.subject' },
    body: { $ref: '$.body' },
  },
};
const updatePrism = {
  fingerprint: automationUpdate.fingerprint,
  context: {
    automationId: { $ref: '$.automationId' },
    runAt: { $ref: '$.runAt' },
    trialDays: { $ref: '$.trialDays' },
    subject: { $ref: '$.subject' },
    body: { $ref: '$.body' },
    enabled: { $ref: '$.enabled' },
  },
};

// THE AUTOMATION FORM, over the list rather than inside it. See
// `plans.form.ts` for the argument.
//
// It fetches its own vocabularies on mount for the same reason the course form
// does: a form its opener has to prime is not separable from the opener.
const automationFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    // WHO, THEN WHAT. Two questions instead of one pick from a frozen list of
    // three — and the second list is filtered by the first, so a combination
    // that would select nothing is not offered.
    {
      component: 'Select',
      props: { label: 'Who it acts on', options: '$.audienceOptions', hint: 'The people this automation looks for, every time it runs.' },
      ref: 'audience',
      model: '$.audience',
    },
    {
      component: 'Select',
      props: { label: 'What it does to them', options: '$.effectOptions' },
      ref: 'effect',
      model: '$.effect',
    },

    // What the pairing means, in a sentence. Composing two vocabularies is only
    // an improvement if you can read what you built.
    { if: '$.intent', then: { component: 'Notice', props: { tone: 'calm', message: '$.intent' } }, else: '' },

    { component: 'Input', props: { label: 'Run at', type: 'time', hint: 'In the studio’s own timezone.' }, ref: 'runAt', model: '$.runAt' },

    // ONLY THE KNOBS THIS PAIRING TAKES. The audience decides whether there is
    // a window; the effect decides whether there are words.
    {
      if: '$.usesTrialDays',
      then: {
        component: 'Input',
        props: { label: 'Trial window (days)', type: 'number', hint: 'How long a trial runs before this counts it as over. Warn at seven and lapse at fourteen by making two.' },
        ref: 'trialDays',
        model: '$.trialDays',
      },
      else: '',
    },
    {
      if: '$.usesMessage',
      then: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          { component: 'Input', props: { label: 'Subject', placeholder: 'Your trial is nearly up' }, ref: 'subject', model: '$.subject' },
          {
            component: 'Input',
            props: { label: 'Message', placeholder: 'Come and talk to us about a plan.', hint: 'The studio’s own words. Class name and time are added automatically where they apply.' },
            ref: 'body',
            model: '$.body',
          },
        ],
      },
      else: '',
    },

    {
      if: '$.automationId',
      then: { component: 'Button', props: { variant: 'solid', big: true, label: 'Save', disabled: '$.saving' }, ref: 'save' },
      else: { component: 'Button', props: { variant: 'solid', big: true, label: 'Add it', disabled: '$.saving' }, ref: 'create' },
    },
  ],
};

const done = (call: string): Step => ({
  call,
  onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'automations-changed' } }, { pop: true }],
  onError: [{ set: 'saving', value: false }],
});

export const automationFormAction: ActionDefinition = {
  id: 'automations.form',
  title: '$.heading',
  data: {
    heading: 'Add an automation',
    automationId: '',
    audience: 'trials.ending',
    effect: 'message',
    audienceOptions: [],
    effectOptions: [],
    runAt: '09:00',
    trialDays: 7,
    subject: '',
    body: '',
    enabled: true,
    usesTrialDays: false,
    usesMessage: false,
    intent: '',
    shape: {},
    saving: false,
    error: '',
  },
  layout: automationFormLayout,
  endpoints: {
    audiences: { fn: 'automations.audiences', target: 'audienceOptions' },
    effects: { fn: 'automations.effects', target: 'effectOptions' },
    shape: { fn: 'automations.shape', target: 'shape' },
    create: { url: '/api/studio/vex', method: 'POST', request: createPrism, errorTarget: 'error' },
    update: { url: '/api/studio/vex', method: 'POST', request: updatePrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'audiences' }, { call: 'effects' }, { call: 'shape', onSuccess: [{ set: 'effect', value: '$.shape.effect' }, { set: 'usesTrialDays', value: '$.shape.usesTrialDays' }, { set: 'usesMessage', value: '$.shape.usesMessage' }, { set: 'intent', value: '$.shape.intent' }] }] },
  triggers: [
    // The form follows the choice. Changing the shape changes which knobs
    // exist, which is the difference between a form and a list of every field
    // any automation has ever needed.
    // SET IT FROM THE PAYLOAD FIRST. The trigger runs before the runtime
    // writes the model back, so calling straight through asked about the
    // PREVIOUS choice and the form answered for the one you just moved off —
    // silently, because a stale answer looks exactly like a correct one.
    //
    // Changing WHO re-offers the WHATs, because not every pairing exists.
    { event: 'ui:model', ref: 'audience', do: [{ set: 'audience', value: '@event.payload' }, { call: 'effects' }, { call: 'shape', onSuccess: [{ set: 'effect', value: '$.shape.effect' }, { set: 'usesTrialDays', value: '$.shape.usesTrialDays' }, { set: 'usesMessage', value: '$.shape.usesMessage' }, { set: 'intent', value: '$.shape.intent' }] }] },
    { event: 'ui:model', ref: 'effect', do: [{ set: 'effect', value: '@event.payload' }, { call: 'effects' }, { call: 'shape', onSuccess: [{ set: 'effect', value: '$.shape.effect' }, { set: 'usesTrialDays', value: '$.shape.usesTrialDays' }, { set: 'usesMessage', value: '$.shape.usesMessage' }, { set: 'intent', value: '$.shape.intent' }] }] },
    { event: 'ui:click', ref: 'create', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('create')] },
    { event: 'ui:click', ref: 'save', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('update')] },
  ],
};

export const automationFormInputSchema = z.toJSONSchema(
  z.object({
    heading: z.string().optional(),
    automationId: z.string().optional().describe('Empty means create. Set means change that automation.'),
    audience: z.string().optional(),
    effect: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    runAt: z.string().optional(),
    trialDays: z.number().optional(),
    enabled: z.boolean().optional(),
  }),
);

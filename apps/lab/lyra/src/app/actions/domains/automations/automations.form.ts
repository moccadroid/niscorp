import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { automationCreate, automationUpdate } from '@lyra/app/vex/tide.entries';
import { EFFECTS, MOMENTS } from '@lyra/app/reflexes/compose';

// THE VOCABULARY, BAKED INTO THE MANIFEST — not fetched from a function.
//
// A moment and an effect are app CONSTANTS: they ship with the release, they
// are the same for every studio, and a round trip to ask what they are is a
// round trip to be told what this file already imports. Each option carries
// its own shape — whether the number means anything, what the message fields
// are called — so choosing one IS learning what the form should show, the
// same way the list's view options carry which panels they open.
//
// Three functions died here: `automations.moments`, `automations.effects`
// and `automations.shape`, the last of which existed only to look up a pair
// in these two arrays.
const MOMENT_OPTIONS = MOMENTS.map((moment) => ({
  value: moment.id,
  label: `When ${moment.label}`,
  phrase: moment.label,
  blurb: moment.blurb,
  watched: moment.watch !== undefined,
  usesDays: typeof moment.daysLabel === 'string',
  daysLabel: moment.daysLabel ?? '',
}));

const EFFECT_OPTIONS = EFFECTS.map((effect) => ({
  value: effect.id,
  label: effect.label,
  phrase: effect.label,
  blurb: effect.blurb,
  usesMessage: effect.words !== undefined,
  subjectLabel: effect.words?.subject ?? '',
  bodyLabel: effect.words?.body ?? '',
  messageHint: effect.words?.hint ?? '',
}));

const FIRST_MOMENT = MOMENT_OPTIONS[0];
const FIRST_EFFECT = EFFECT_OPTIONS[0];

// The sentence and the intent are the only two things that need BOTH halves,
// so they are composed from the data rather than carried on either option.
//
// STAGED, through a message, because a `$prism` set reads the action's root
// data as it was when the batch began: composing in the same `do` that sets
// the halves would read the previous pairing and always be one change behind.
const COMPOSE: Step[] = [
  { set: 'sentence', value: { $prism: { $join: { parts: ['When ', { $ref: '$.momentPhrase' }, ', ', { $ref: '$.effectPhrase' }], sep: '' } } } },
  { set: 'intent', value: { $prism: { $join: { parts: [{ $ref: '$.momentBlurb' }, ' ', { $ref: '$.effectBlurb' }], sep: '' } } } },
];

const createPrism = {
  fingerprint: automationCreate.fingerprint,
  context: {
    moment: { $ref: '$.moment' },
    effect: { $ref: '$.effect' },
    runAt: { $ref: '$.runAt' },
    days: { $ref: '$.days' },
    subject: { $ref: '$.subject' },
    body: { $ref: '$.body' },
  },
};
const updatePrism = {
  fingerprint: automationUpdate.fingerprint,
  context: {
    automationId: { $ref: '$.automationId' },
    runAt: { $ref: '$.runAt' },
    days: { $ref: '$.days' },
    subject: { $ref: '$.subject' },
    body: { $ref: '$.body' },
    enabled: { $ref: '$.enabled' },
  },
};

const automationFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    {
      component: 'Select',
      props: { label: 'When this happens', options: '$.momentOptions', hint: 'The instant this reacts to.' },
      ref: 'moment',
      model: '$.moment',
    },
    {
      component: 'Select',
      props: { label: 'Do this', options: '$.effectOptions' },
      ref: 'effect',
      model: '$.effect',
    },

    // Composing two vocabularies is only an improvement if you can see what you
    // made.
    { if: '$.sentence', then: { component: 'Notice', props: { tone: 'calm', message: '$.sentence' } }, else: '' },
    { if: '$.intent', then: { component: 'Prose', props: { size: 'sm', color: 'mute' }, children: '$.intent' }, else: '' },

    // WHO IT WOULD REACH, before it is saved rather than after.
    //
    // Preview existed, on the list, once the automation was already running.
    // This asks the same question one step earlier — while the sentence is
    // still being composed — because both ways of building a useless
    // automation were invisible until then: one that matches nobody, and one
    // the studio's automations are not permitted to run at all.
    {
      if: '$.audience.known',
      then: {
        component: 'Notice',
        props: { tone: '$.audience.tone', message: '$.audience.summary', detail: '$.audience.names' },
      },
      else: '',
    },

    // Only the knobs this sentence takes: a WATCHED moment has no hour, so
    // asking for one would be asking for a number the automation ignores.
    {
      if: '$.watched',
      then: { component: 'Notice', props: { tone: 'good', message: 'This one runs as it happens, within a minute. There is no time to set.' } },
      else: { component: 'Input', props: { label: 'Run at', type: 'time', hint: 'In the studio’s own timezone.' }, ref: 'runAt', model: '$.runAt' },
    },

    {
      if: '$.usesDays',
      then: {
        component: 'Input',
        props: { label: '$.daysLabel', type: 'number' },
        ref: 'days',
        model: '$.days',
      },
      else: '',
    },
    {
      if: '$.usesMessage',
      then: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          // The LABELS come from the effect. "Subject" is right for an email
          // and wrong for a tag, where the same field holds one word.
          { component: 'Input', props: { label: '$.subjectLabel', hint: '$.messageHint' }, ref: 'subject', model: '$.subject' },
          {
            if: '$.bodyLabel',
            then: { component: 'Textarea', props: { label: '$.bodyLabel' }, ref: 'body', model: '$.body' },
            else: '',
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
    // The defaults ARE the first option of each list, so a form opened from
    // scratch already describes the pairing it is showing.
    moment: FIRST_MOMENT?.value ?? '',
    effect: FIRST_EFFECT?.value ?? '',
    momentOptions: MOMENT_OPTIONS,
    effectOptions: EFFECT_OPTIONS,
    momentPhrase: FIRST_MOMENT?.phrase ?? '',
    momentBlurb: FIRST_MOMENT?.blurb ?? '',
    effectPhrase: FIRST_EFFECT?.phrase ?? '',
    effectBlurb: FIRST_EFFECT?.blurb ?? '',
    runAt: '09:00',
    days: 7,
    subject: '',
    body: '',
    enabled: true,
    usesDays: FIRST_MOMENT?.usesDays ?? false,
    daysLabel: FIRST_MOMENT?.daysLabel ?? '',
    watched: FIRST_MOMENT?.watched ?? false,
    usesMessage: FIRST_EFFECT?.usesMessage ?? false,
    subjectLabel: FIRST_EFFECT?.subjectLabel ?? '',
    bodyLabel: FIRST_EFFECT?.bodyLabel ?? '',
    messageHint: FIRST_EFFECT?.messageHint ?? '',
    sentence: `When ${FIRST_MOMENT?.phrase ?? ''}, ${FIRST_EFFECT?.phrase ?? ''}`,
    intent: `${FIRST_MOMENT?.blurb ?? ''} ${FIRST_EFFECT?.blurb ?? ''}`,
    audience: { known: false, tone: 'neutral', summary: '', names: '' },
    saving: false,
    error: '',
  },
  layout: automationFormLayout,
  endpoints: {
    audience: { fn: 'automations.audience', target: 'audience' },
    create: { url: '/api/studio/vex', method: 'POST', request: createPrism, errorTarget: 'error' },
    update: { url: '/api/studio/vex', method: 'POST', request: updatePrism, errorTarget: 'error' },
  },
  // A form opened from a card or a recipe arrives with that pairing's shape
  // already in its input, so the sentence only has to be composed.
  lifecycle: { mount: [{ emit: { channel: 'compose-sentence' } }, { call: 'audience' }] },
  triggers: [
    { message: 'compose-sentence', do: COMPOSE },
    // The option IS the shape: picking one carries what the form should show
    // with it, so there is nothing to go and ask.
    {
      event: 'ui:model',
      ref: 'moment',
      do: [
        { set: 'moment', value: '@event.payload.value' },
        { set: 'momentPhrase', value: '@event.payload.phrase' },
        { set: 'momentBlurb', value: '@event.payload.blurb' },
        { set: 'watched', value: '@event.payload.watched' },
        { set: 'usesDays', value: '@event.payload.usesDays' },
        { set: 'daysLabel', value: '@event.payload.daysLabel' },
        { emit: { channel: 'compose-sentence' } },
        { call: 'audience' },
      ],
    },
    {
      event: 'ui:model',
      ref: 'effect',
      do: [
        { set: 'effect', value: '@event.payload.value' },
        { set: 'effectPhrase', value: '@event.payload.phrase' },
        { set: 'effectBlurb', value: '@event.payload.blurb' },
        { set: 'usesMessage', value: '@event.payload.usesMessage' },
        { set: 'subjectLabel', value: '@event.payload.subjectLabel' },
        { set: 'bodyLabel', value: '@event.payload.bodyLabel' },
        { set: 'messageHint', value: '@event.payload.messageHint' },
        { emit: { channel: 'compose-sentence' } },
      ],
    },
    { event: 'ui:model', ref: 'runAt', do: [{ set: 'runAt', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'days', do: [{ set: 'days', value: '@event.payload' }, { call: 'audience' }] },
    { event: 'ui:model', ref: 'subject', do: [{ set: 'subject', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'body', do: [{ set: 'body', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'create', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('create')] },
    { event: 'ui:click', ref: 'save', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('update')] },
  ],
};

export const automationFormInputSchema = z.toJSONSchema(
  z.object({
    heading: z.string().optional(),
    automationId: z.string().optional().describe('Empty means create. Set means change that automation.'),
    moment: z.string().optional(),
    effect: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    runAt: z.string().optional(),
    days: z.number().optional(),
    enabled: z.boolean().optional(),
    // The pairing's SHAPE, carried in by whatever opened the form — a card or
    // a recipe already knows it, so the form has nothing to look up.
    momentPhrase: z.string().optional(),
    momentBlurb: z.string().optional(),
    effectPhrase: z.string().optional(),
    effectBlurb: z.string().optional(),
    watched: z.boolean().optional(),
    usesDays: z.boolean().optional(),
    daysLabel: z.string().optional(),
    usesMessage: z.boolean().optional(),
    subjectLabel: z.string().optional(),
    bodyLabel: z.string().optional(),
    messageHint: z.string().optional(),
  }),
);

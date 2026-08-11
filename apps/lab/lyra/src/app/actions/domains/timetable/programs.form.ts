import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { programCreatePrism, programUpdatePrism } from './timetable.prism';

// THE PROGRAM FORM, over the list rather than inside it. Same move as the plan
// form, same reason — see `plans.form.ts` for the argument. An empty
// `programId` is a create; a seeded one is an edit. There is no mode flag.
const programFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    { component: 'Input', props: { label: 'Name', placeholder: 'Vinyasa Flow' }, ref: 'name', model: '$.name' },
    { component: 'Input', props: { label: 'Blurb', placeholder: 'Breath-led, continuous movement. All levels.' }, ref: 'blurb', model: '$.blurb' },
    // A COLOUR PICKER THAT OFFERS COLOURS.
    //
    // This used to be a dropdown reading Accent / Calm / Warm / **Alert** /
    // **Good** / Neutral — six status words, no swatches — so naming a stream
    // meant choosing whether Competition was an emergency or a success. Ten
    // hues now, each shown as the colour it is, and none of them claims
    // anything about the class.
    {
      component: 'Select',
      props: {
        label: 'Colour',
        hint: 'A token, not a hex — so it follows the studio’s theme instead of fighting it.',
        options: [
          { value: 'rose', label: 'Rose' },
          { value: 'amber', label: 'Amber' },
          { value: 'lime', label: 'Lime' },
          { value: 'emerald', label: 'Emerald' },
          { value: 'teal', label: 'Teal' },
          { value: 'sky', label: 'Sky' },
          { value: 'indigo', label: 'Indigo' },
          { value: 'violet', label: 'Violet' },
          { value: 'fuchsia', label: 'Fuchsia' },
          { value: 'stone', label: 'Stone' },
        ],
      },
      ref: 'colour',
      model: '$.colour',
    },
    // The choice, shown as itself. A word for a colour is a word; the swatch
    // is the only part of this field that answers "what will it look like".
    {
      component: 'Row',
      props: { gap: 8, align: 'center' },
      children: [
        { component: 'Dot', props: { tone: '$.colour', size: 14 } },
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'How this stream will be marked on every schedule.' },
      ],
    },
    {
      component: 'Row',
      props: { gap: 10 },
      children: [
        {
          if: '$.programId',
          then: { component: 'Button', props: { variant: 'solid', big: true, label: 'Save', disabled: '$.saving' }, ref: 'save' },
          else: { component: 'Button', props: { variant: 'solid', big: true, label: 'Add class type', disabled: '$.saving' }, ref: 'create' },
        },
      ],
    },
  ],
};

const done = (call: string): Step => ({
  call,
  onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'sessions-changed' } }, { pop: true }],
  onError: [{ set: 'saving', value: false }],
});

export const programFormAction: ActionDefinition = {
  id: 'programs.form',
  title: '$.heading',
  data: { heading: 'Add a class type', programId: '', name: '', blurb: '', colour: 'accent', saving: false, error: '' },
  layout: programFormLayout,
  endpoints: {
    create: { url: '/api/schedule/vex', method: 'POST', request: programCreatePrism, errorTarget: 'error' },
    update: { url: '/api/schedule/vex', method: 'POST', request: programUpdatePrism, errorTarget: 'error' },
  },
  triggers: [
    { event: 'ui:click', ref: 'create', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('create')] },
    { event: 'ui:click', ref: 'save', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('update')] },
  ],
};

export const programFormInputSchema = z.toJSONSchema(
  z.object({
    heading: z.string().optional(),
    programId: z.string().optional().describe('Empty means create. Set means edit that program.'),
    name: z.string().optional(),
    blurb: z.string().optional(),
    colour: z.string().optional(),
  }),
);

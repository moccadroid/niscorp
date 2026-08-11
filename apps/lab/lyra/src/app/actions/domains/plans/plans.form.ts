import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { planCreatePrism, planRestorePrism, planRetirePrism, planUpdatePrism } from './plans.prism';

// THE PLAN FORM, AS ITS OWN ACTION.
//
// It used to be a card that unfolded inside the list, gated on `editing`. That
// works and it is the wrong shape: editing something is not a state the list is
// in, it is a thing you are doing TO one row — and while you did it the list
// jumped, the form landed wherever the row happened to be, and on a phone it
// pushed everything else off the screen.
//
// As a separate action it is opened over the list in the sheet, seeded by the
// opener, and it announces what it did rather than reaching back:
//
//   push: { action: 'plans.form', canvas: 'sheet', with: ['sheet'], input: {…} }
//   { message: 'plans-changed', do: [{ call: 'load' }] }
//
// Which is the same shape as `confirm`, and for the same reason: the list does
// not know how a plan is edited, and the form does not know who is listening.
//
// `planId` empty is what makes this a create. Nothing branches on a mode flag —
// there is no mode, only whether an id was seeded.
const planFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    { component: 'Input', props: { label: 'Name', placeholder: 'Unlimited' }, ref: 'name', model: '$.name' },
    // STILL CENTS ON THE WIRE, decimal on the glass. Storing money as an
    // integer is right; asking a person at a desk to type 8900 for €89.00 and
    // explaining the conversion in a hint is how a plan ends up costing €890.
    // The field does the arithmetic now — see `Money` in ui/components/forms.
    { component: 'Money', props: { label: 'Price', hint: 'What a member pays each period.' }, ref: 'priceCents', model: '$.priceCents' },
    {
      component: 'Select',
      props: {
        label: 'Billed',
        options: [
          { value: 'month', label: 'Monthly' },
          { value: 'year', label: 'Yearly' },
        ],
      },
      ref: 'interval',
      model: '$.interval',
    },
    {
      component: 'Select',
      props: {
        label: 'Classes included',
        numeric: true,
        // Empty is a real answer here — NULL means unlimited, and the list says
        // so in words rather than leaving a blank cell.
        emptyLabel: 'Unlimited',
        options: [
          { value: '4', label: 'Four a month' },
          { value: '8', label: 'Eight a month' },
          { value: '12', label: 'Twelve a month' },
          { value: '16', label: 'Sixteen a month' },
        ],
      },
      ref: 'classAllowance',
      model: '$.classAllowance',
    },
    {
      component: 'Row',
      props: { gap: 10, wrap: true },
      children: [
        {
          if: '$.planId',
          then: { component: 'Button', props: { variant: 'solid', big: true, label: 'Save', disabled: '$.saving' }, ref: 'save' },
          else: { component: 'Button', props: { variant: 'solid', big: true, label: 'Add plan', disabled: '$.saving' }, ref: 'create' },
        },

        // Only an existing plan can be retired, and only a retired one
        // restored — so the destructive-looking control never appears next to a
        // plan that has never been sold.
        {
          if: '$.planId',
          then: {
            if: '$.planActive',
            then: { component: 'Button', props: { variant: 'danger', big: true, label: 'Retire' }, ref: 'retire' },
            else: { component: 'Button', props: { variant: 'ghost', big: true, label: 'Offer again' }, ref: 'restore' },
          },
          else: '',
        },
      ],
    },
  ],
};

// Save, announce, close. Three steps, and the middle one is what keeps the
// list in step without either action naming the other.
const done = (call: string): Step => ({
  call,
  onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'plans-changed' } }, { pop: true }],
  onError: [{ set: 'saving', value: false }],
});

export const planFormAction: ActionDefinition = {
  id: 'plans.form',
  // The sheet's header renders this, so the form carries its own heading and
  // the layout does not print one.
  title: '$.heading',
  data: {
    heading: 'Add a plan',
    planId: '',
    planActive: true,
    name: '',
    priceCents: 0,
    interval: 'month',
    classAllowance: '',
    saving: false,
    error: '',
  },
  layout: planFormLayout,
  endpoints: {
    create: { url: '/api/studio/vex', method: 'POST', request: planCreatePrism, errorTarget: 'error' },
    update: { url: '/api/studio/vex', method: 'POST', request: planUpdatePrism, errorTarget: 'error' },
    retire: { url: '/api/studio/vex', method: 'POST', request: planRetirePrism, errorTarget: 'error' },
    restore: { url: '/api/studio/vex', method: 'POST', request: planRestorePrism, errorTarget: 'error' },
  },
  triggers: [
    { event: 'ui:click', ref: 'create', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('create')] },
    { event: 'ui:click', ref: 'save', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('update')] },
    { event: 'ui:click', ref: 'retire', do: [{ set: 'error', value: '' }, done('retire')] },
    { event: 'ui:click', ref: 'restore', do: [{ set: 'error', value: '' }, done('restore')] },
  ],
};

// Rule 14: what an opener may seed. A create seeds nothing; an edit seeds the
// row. Neither can seed anything the form does not already declare.
export const planFormInputSchema = z.toJSONSchema(
  z.object({
    heading: z.string().optional(),
    planId: z.string().optional().describe('Empty means create. Set means edit that plan.'),
    planActive: z.boolean().optional(),
    name: z.string().optional(),
    priceCents: z.number().optional(),
    interval: z.string().optional(),
    classAllowance: z.union([z.string(), z.number()]).optional(),
  }),
);

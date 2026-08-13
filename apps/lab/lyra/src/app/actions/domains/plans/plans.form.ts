import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { planCreatePrism, planRestorePrism, planRetirePrism, planUpdatePrism } from './plans.prism';

const planFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    // What KIND of thing is on sale decides which questions below make sense.
    // Fixed once created: everybody holding one was sold that shape.
    {
      if: '$.planId',
      then: '',
      else: {
        component: 'Select',
        props: {
          label: 'What is it',
          options: [
            { value: 'recurring', label: 'A plan — billed on repeat' },
            { value: 'pass', label: 'A pass — classes bought up front' },
          ],
        },
        ref: 'kind',
        model: '$.kind',
      },
    },
    { component: 'Input', props: { label: 'Name', placeholder: 'Unlimited' }, ref: 'name', model: '$.name' },
    { component: 'Money', props: { label: 'Price', hint: 'What a member pays each period — or once, for a pass.' }, ref: 'priceCents', model: '$.priceCents' },
    {
      if: { $eq: ['$.kind', 'pass'] },
      then: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          {
            component: 'Select',
            props: {
              label: 'Classes in the pack',
              numeric: true,
              hint: 'One class IS the drop-in — no separate thing to set up.',
              options: [
                { value: '1', label: 'One — a drop-in' },
                { value: '5', label: 'Five' },
                { value: '10', label: 'Ten' },
                { value: '20', label: 'Twenty' },
              ],
            },
            ref: 'credits',
            model: '$.credits',
          },
          {
            component: 'Select',
            props: {
              label: 'Valid for',
              numeric: true,
              emptyLabel: 'Never expires',
              options: [
                { value: '30', label: 'Thirty days' },
                { value: '90', label: 'Three months' },
                { value: '180', label: 'Six months' },
                { value: '365', label: 'A year' },
              ],
            },
            ref: 'validDays',
            model: '$.validDays',
          },
        ],
      },
      else: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
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
              // Empty is a real answer here — NULL means unlimited, and the list
              // says so in words rather than leaving a blank cell.
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
        ],
      },
    },

    // ── WHAT THEY ARE COMMITTING TO ────────────────────────────
    //
    // A plan is not only a price. "Twelve months, one month's notice" and
    // "rolling, cancel any time" are different products at the same number, and
    // the difference is most of what a studio is actually selling — revenue
    // inside a minimum term is money it HAS; outside one it is money it hopes
    // for. A pass commits nobody to anything, so neither question is asked.
    {
      if: { $eq: ['$.kind', 'pass'] },
      then: '',
      else: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          {
            component: 'Select',
            props: {
              label: 'Minimum term',
              numeric: true,
              hint: 'How long they commit for. Leaving early does not end the obligation.',
              options: [
                { value: '0', label: 'No minimum — rolling' },
                { value: '3', label: 'Three months' },
                { value: '6', label: 'Six months' },
                { value: '12', label: 'Twelve months' },
                { value: '24', label: 'Twenty-four months' },
              ],
            },
            ref: 'minimumTermMonths',
            model: '$.minimumTermMonths',
          },
          {
            component: 'Select',
            props: {
              label: 'Notice period',
              numeric: true,
              hint: 'How long before leaving takes effect. Notice inside a minimum term still runs to the end of it.',
              options: [
                { value: '0', label: 'None — ends immediately' },
                { value: '14', label: 'Two weeks' },
                { value: '30', label: 'One month' },
                { value: '60', label: 'Two months' },
                { value: '90', label: 'Three months' },
              ],
            },
            ref: 'noticeDays',
            model: '$.noticeDays',
          },
        ],
      },
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
    heading: 'Add to the price list',
    planId: '',
    planActive: true,
    kind: 'recurring',
    name: '',
    priceCents: 0,
    interval: 'month',
    classAllowance: '',
    minimumTermMonths: 0,
    noticeDays: 0,
    credits: 1,
    validDays: '',
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
    planId: z.string().optional().describe('Empty means create. Set means edit that offering.'),
    planActive: z.boolean().optional(),
    kind: z.enum(['recurring', 'pass']).optional().describe('What is being sold. Fixed once created — everybody holding one was sold that shape.'),
    name: z.string().optional(),
    priceCents: z.number().optional(),
    interval: z.string().optional(),
    classAllowance: z.union([z.string(), z.number()]).optional(),
    minimumTermMonths: z.union([z.string(), z.number()]).optional(),
    noticeDays: z.union([z.string(), z.number()]).optional(),
    credits: z.union([z.string(), z.number()]).optional(),
    validDays: z.union([z.string(), z.number()]).optional(),
  }),
);

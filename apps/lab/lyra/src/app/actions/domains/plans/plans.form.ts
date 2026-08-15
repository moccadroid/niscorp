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
            // Sold once and granting nothing: the joining fee, the deposit, the
            // workshop ticket, the gi. It asks no further questions, because
            // there are none — no period, no terms, no credits.
            { value: 'one_off', label: 'A one-off — sold once, grants nothing' },
          ],
        },
        ref: 'kind',
        model: '$.kind',
      },
    },
    { component: 'Input', props: { label: 'Name', placeholder: 'Unlimited' }, ref: 'name', model: '$.name' },
    { component: 'Money', props: { label: 'Price', hint: 'What a member pays each period — or once, for a pass or a one-off.' }, ref: 'priceCents', model: '$.priceCents' },
    {
      if: { $eq: ['$.kind', 'pass'] },
      then: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          {
            component: 'Input',
            props: {
              label: 'Classes in the pack',
              type: 'number',
              hint: 'One class IS the drop-in — no separate thing to set up.',
            },
            ref: 'credits',
            model: '$.credits',
          },
          {
            component: 'Input',
            props: {
              label: 'Valid for (days)',
              type: 'number',
              hint: 'How long the pack lives once it is bought. Leave it empty and it never expires.',
            },
            ref: 'validDays',
            model: '$.validDays',
          },
        ],
      },
      // A one-off has no period and no allowance — it is a name and a price.
      else: {
        if: { $eq: ['$.kind', 'one_off'] },
        then: '',
        else: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          // ── HOW OFTEN, AS A PAIR ───────────────────────────────
          //
          // A unit and a count, because "quarterly" is not a fifth word — it is
          // every three months, and a studio billing every ten weeks is doing
          // the same thing with different numbers. Two fields say all of it;
          // a menu of named periods would be back to guessing which ones exist.
          //
          // The four units are Stripe's, and that is the one limit here that is
          // not ours: a period a processor cannot express is one nobody can be
          // charged.
          {
            component: 'Row',
            props: { gap: 12, align: 'end', wrap: true },
            children: [
              {
                component: 'Input',
                props: {
                  label: 'Billed every',
                  type: 'number',
                  hint: 'Leave it empty for every one.',
                },
                ref: 'intervalCount',
                model: '$.intervalCount',
              },
              {
                component: 'Select',
                props: {
                  label: ' ',
                  options: [
                    { value: 'day', label: 'Days' },
                    { value: 'week', label: 'Weeks' },
                    { value: 'month', label: 'Months' },
                    { value: 'year', label: 'Years' },
                  ],
                },
                ref: 'interval',
                model: '$.interval',
              },
            ],
          },
          {
            component: 'Input',
            props: {
              label: 'Classes included',
              type: 'number',
              // Empty is a real answer here — NULL means unlimited — so the
              // hint says so rather than leaving somebody guessing what a blank
              // field will do to their price list.
              hint: 'How many classes a period buys. Leave it empty for unlimited.',
            },
            ref: 'classAllowance',
            model: '$.classAllowance',
          },
        ],
        },
      },
    },

    // ── WHAT THEY ARE COMMITTING TO ────────────────────────────
    //
    // A plan is not only a price. "Twelve months, one month's notice" and
    // "rolling, cancel any time" are different products at the same number, and
    // the difference is most of what a studio is actually selling — revenue
    // inside a minimum term is money it HAS; outside one it is money it hopes
    // for. Neither a pass nor a one-off commits anybody to anything, so neither
    // question is asked of them.
    {
      if: { $eq: ['$.kind', 'recurring'] },
      then: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          {
            component: 'Input',
            props: {
              label: 'Minimum term (months)',
              type: 'number',
              hint: 'How long they commit for. Leaving early does not end the obligation. Empty or 0 is rolling.',
            },
            ref: 'minimumTermMonths',
            model: '$.minimumTermMonths',
          },
          {
            component: 'Input',
            props: {
              label: 'Notice period (days)',
              type: 'number',
              hint: 'How long before leaving takes effect. Notice inside a minimum term still runs to the end of it. Empty or 0 ends it immediately.',
            },
            ref: 'noticeDays',
            model: '$.noticeDays',
          },
        ],
      },
      else: '',
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
    intervalCount: 1,
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
    intervalCount: z.union([z.string(), z.number()]).optional(),
    classAllowance: z.union([z.string(), z.number()]).optional(),
    minimumTermMonths: z.union([z.string(), z.number()]).optional(),
    noticeDays: z.union([z.string(), z.number()]).optional(),
    credits: z.union([z.string(), z.number()]).optional(),
    validDays: z.union([z.string(), z.number()]).optional(),
  }),
);

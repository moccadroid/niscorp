import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { oneOffOptionsPrism, planCreatePrism, planDeletePrism, planRestorePrism, planRetirePrism, planUpdatePrism } from './plans.prism';

const nameMissing = { $prism: { $eq: [{ $trim: { $ref: '$.name' } }, ''] } };

const planFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
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
      else: {
        if: { $eq: ['$.kind', 'one_off'] },
        then: '',
        else: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          // The four units are Stripe's: a period a processor cannot express is
          // one nobody can be charged.
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
              hint: 'How many classes a period buys. Leave it empty for unlimited.',
            },
            ref: 'classAllowance',
            model: '$.classAllowance',
          },
        ],
        },
      },
    },

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
          {
            component: 'Select',
            props: {
              label: 'Joining fee',
              emptyLabel: 'None',
              hint: 'Charged once, with the first payment. Create it as a one-off first and it appears here.',
              options: '$.oneOffOptions',
            },
            ref: 'joiningFeeId',
            model: '$.joiningFeeId',
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
          then: { component: 'Button', props: { variant: 'solid', big: true, label: 'Save', disabled: '$.blocked' }, ref: 'save' },
          else: { component: 'Button', props: { variant: 'solid', big: true, label: 'Add plan', disabled: '$.blocked' }, ref: 'create' },
        },

        // `planHeld` arrives with the row and can be stale: the database refuses
        // to delete a row something holds.
        {
          if: '$.planId',
          then: {
            if: '$.planHeld',
            then: {
              if: '$.planActive',
              then: { component: 'Button', props: { variant: 'danger', big: true, label: 'Retire' }, ref: 'retire' },
              else: { component: 'Button', props: { variant: 'ghost', big: true, label: 'Offer again' }, ref: 'restore' },
            },
            else: { component: 'Button', props: { variant: 'danger', big: true, label: 'Delete' }, ref: 'delete' },
          },
          else: '',
        },
      ],
    },
    {
      if: '$.planId',
      then: {
        if: '$.planHeld',
        then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Somebody is already on this. Retiring keeps everybody who has it.' },
        else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Nobody has ever taken this — deleting it removes it for good.' },
      },
      else: '',
    },
  ],
};

const done = (call: string): Step => ({
  call,
  onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'plans-changed' } }, { pop: true }],
  onError: [{ set: 'saving', value: false }],
});

export const planFormAction: ActionDefinition = {
  id: 'plans.form',
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
    joiningFeeId: '',
    oneOffOptions: [],
    blocked: true,
    planHeld: 0,
    saving: false,
    error: '',
  },
  layout: planFormLayout,
  endpoints: {
    create: { url: '/api/studio/vex', method: 'POST', request: planCreatePrism, errorTarget: 'error' },
    update: { url: '/api/studio/vex', method: 'POST', request: planUpdatePrism, errorTarget: 'error' },
    retire: { url: '/api/studio/vex', method: 'POST', request: planRetirePrism, errorTarget: 'error' },
    restore: { url: '/api/studio/vex', method: 'POST', request: planRestorePrism, errorTarget: 'error' },
    remove: { url: '/api/studio/vex', method: 'POST', request: planDeletePrism, errorTarget: 'error' },
    oneOffs: { url: '/api/studio/vex', method: 'POST', request: oneOffOptionsPrism, target: 'oneOffOptions' },
  },
  lifecycle: { mount: [{ call: 'oneOffs' }] },
  triggers: [
    // Two triggers, not two steps: the sets of one trigger resolve against the
    // same pre-write snapshot.
    { event: 'ui:model', ref: 'name', do: [{ set: 'name', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'name', do: [{ set: 'blocked', value: nameMissing }] },
    { event: 'ui:click', ref: 'create', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('create')] },
    { event: 'ui:click', ref: 'save', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('update')] },
    { event: 'ui:click', ref: 'retire', do: [{ set: 'error', value: '' }, done('retire')] },
    { event: 'ui:click', ref: 'restore', do: [{ set: 'error', value: '' }, done('restore')] },
    { event: 'ui:click', ref: 'delete', do: [{ set: 'error', value: '' }, done('remove')] },
  ],
};

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
    joiningFeeId: z.string().optional().describe('Another offering, of kind one_off, charged once when somebody joins.'),
    planHeld: z.number().optional().describe('How many subscriptions, passes, purchases and plans point at this. Zero means it was never a product and can be deleted.'),
    blocked: z.boolean().optional(),
  }),
);

import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { oneOffOptionsPrism, planCreatePrism, planDeletePrism, planRestorePrism, planRetirePrism, planUpdatePrism } from './plans.prism';

// A NAME IS THE ONLY ANSWER THIS FORM INSISTS ON, and it did not insist on it:
// the sheet opened, Add was live, and pressing it wrote a nameless row at zero
// that could then only be retired. The column refuses it now too — see the
// CHECK on offerings.name — and this is what stops somebody meeting that
// refusal as a database error.
//
// Zero is NOT blocked. A studio giving something away is a studio selling it
// for nothing, and the form has no business arguing.
const nameMissing = { $prism: { $eq: [{ $trim: { $ref: '$.name' } }, ''] } };

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
          // ── WHAT JOINING COSTS ON TOP ────────────────────────
          //
          // A joining fee is a one-off that is not CHOSEN — it is charged
          // because somebody joined. A studio could create one and price it and
          // nothing ever charged it: it appeared on the member's Buy screen as
          // something they might voluntarily purchase, which nobody does.
          //
          // It names another offering rather than holding an amount, so the fee
          // has a name and a price of its own, shows on this same list, and can
          // be shared by two plans without being typed twice.
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

        // ── THE WAY OUT, AND THERE ARE TWO OF THEM ───────────
        //
        // Retiring is for a product a studio has stopped selling: everybody on
        // it stays on it, which is the whole reason the verb exists. Deleting is
        // for a row that was never a product — the mistyped price, the sheet
        // opened by accident — and it had no verb at all, so every mistake
        // became another permanently retired line on the price list.
        //
        // Which one shows is decided by the row, which arrives carrying how
        // many things hold it. If that count is stale the database refuses in a
        // sentence, so the worst this can be is wrong about a button.
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
    // WHAT EITHER BUTTON WILL DO. A danger button with no sentence beside it
    // makes somebody guess whether they are about to take a price off the list
    // or take it away from the people paying it.
    //
    // THE WORDS LIVE HERE, and the query answers only the number they turn on.
    // They used to be assembled in the mapping, which put a phrase-book pattern
    // into a plain data field: every offering with two holders or more said
    // "[object Object]" to its owner. Prose in a layout is also prose a
    // translator can find.
    //
    // And it says SOMEBODY rather than how many, which is the whole reason this
    // now fits in two strings: a sentence carrying a count needs one phrasing
    // for one holder and another for several, in every language it is ever
    // written in. What the owner has to know here is that this is not a mistake
    // they can delete.
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
    joiningFeeId: '',
    oneOffOptions: [],
    // Nothing is typed yet, so nothing can be saved yet.
    blocked: true,
    // How many things hold this. Zero is what makes the row deletable; the
    // create case is zero because it does not exist yet, and the Delete button
    // is behind `planId` anyway.
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
    // The name decides whether anything can be saved, so every keystroke in it
    // re-asks. Set from the event rather than read back from the field, for the
    // buffered-snapshot reason people.actions.ts spells out.
    { event: 'ui:model', ref: 'name', do: [{ set: 'name', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'name', do: [{ set: 'blocked', value: nameMissing }] },
    { event: 'ui:click', ref: 'create', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('create')] },
    { event: 'ui:click', ref: 'save', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('update')] },
    { event: 'ui:click', ref: 'retire', do: [{ set: 'error', value: '' }, done('retire')] },
    { event: 'ui:click', ref: 'restore', do: [{ set: 'error', value: '' }, done('restore')] },
    { event: 'ui:click', ref: 'delete', do: [{ set: 'error', value: '' }, done('remove')] },
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
    joiningFeeId: z.string().optional().describe('Another offering, of kind one_off, charged once when somebody joins.'),
    planHeld: z.number().optional().describe('How many subscriptions, passes, purchases and plans point at this. Zero means it was never a product and can be deleted.'),
    blocked: z.boolean().optional(),
  }),
);

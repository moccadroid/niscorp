import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { plansLayout } from './plans.layout';
import { plansPrism } from './plans.prism';

// WHAT THE STUDIO SELLS.
//
// Manager and up, by ring 1 (`plans.*`) and ring 3 (`plans.write.*`) both.
// The desk can sign somebody up onto a plan; only a manager can decide what
// the plans ARE, and the price list is the one thing in this application a
// front-desk mistake would be expensive.
//
// Four writes, no delete. `retire` and `restore` are the same update with the
// flag flipped, and they exist because subscriptions point at plans: dropping
// a price a hundred people are paying would either orphan their rows or
// silently move them onto a price they never agreed to.
export const plansAction: ActionDefinition = {
  id: 'plans.list',
  title: 'Plans',
  data: { plans: [], loading: true },
  layout: plansLayout,
  endpoints: {
    load: { url: '/api/studio/vex', method: 'POST', request: plansPrism, target: 'plans' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    // OPEN THE FORM, do not become it. The list stopped holding a draft plan:
    // an id (or none) is seeded into the form and the list goes back to being
    // a list.
    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'plans.form', canvas: 'sheet', with: ['sheet'], input: { heading: 'Add a plan' } } }] },
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'plans.form',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              heading: 'Edit plan',
              planId: '@event.payload.plan_id',
              planActive: '@event.payload.active',
              name: '@event.payload.name',
              priceCents: '@event.payload.price_cents',
              interval: '@event.payload.interval',
              classAllowance: '@event.payload.class_allowance',
            },
          },
        },
      ],
    },
    // The form announces; this listens. Neither names the other.
    { message: 'plans-changed', do: [{ call: 'load' }] },
  ],
};

export const plansInputSchema = z.toJSONSchema(z.object({}));

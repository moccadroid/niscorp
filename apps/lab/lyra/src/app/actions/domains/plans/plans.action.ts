import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { plansLayout } from './plans.layout';
import { coursesOnSalePrism, plansPrism } from './plans.prism';

export const plansAction: ActionDefinition = {
  id: 'plans.list',
  title: 'Offers',
  // Empty `sortBy` keeps the entry's own order: offered first, then by price.
  data: { plans: [], courses: [], loading: true, sortBy: '', sortDir: 'asc' },
  layout: plansLayout,
  endpoints: {
    load: { url: '/api/studio/vex', method: 'POST', request: plansPrism, target: 'plans' },
    courses: { url: '/api/studio/vex', method: 'POST', request: coursesOnSalePrism, target: 'courses' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'courses' }] },
  triggers: [
    // The database owns the order — a header click is a re-read.
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.key' }, { set: 'sortDir', value: '@event.payload.dir' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'plans.form', canvas: 'sheet', with: ['sheet'], input: { heading: 'Add to the price list' } } }] },
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
              heading: 'Edit offering',
              planId: '@event.payload.offering_id',
              planActive: '@event.payload.active',
              kind: '@event.payload.kind',
              name: '@event.payload.name',
              priceCents: '@event.payload.price_cents',
              interval: '@event.payload.interval',
              intervalCount: '@event.payload.interval_count',
              classAllowance: '@event.payload.class_allowance',
              // Seeded because the form SAVES them. Without these the edit
              // opens with empty terms and Save writes the emptiness back — a
              // twelve-month plan silently becomes rolling because somebody
              // corrected a typo in its name.
              minimumTermMonths: '@event.payload.minimum_term_months',
              noticeDays: '@event.payload.notice_days',
              credits: '@event.payload.credits',
              validDays: '@event.payload.valid_days',
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

import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { plansLayout } from './plans.layout';
import { coursesOnSalePrism, plansPrism } from './plans.prism';

export const plansAction: ActionDefinition = {
  id: 'plans.list',
  title: 'Offers',
  data: { plans: [], courses: [], loading: true, sortBy: '', sortDir: 'asc' },
  layout: plansLayout,
  endpoints: {
    load: { url: '/api/studio/vex', method: 'POST', request: plansPrism, target: 'plans' },
    courses: { url: '/api/studio/vex', method: 'POST', request: coursesOnSalePrism, target: 'courses' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'courses' }] },
  triggers: [
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
              // Seeded because the form saves them: without these an edit opens
              // with empty terms and Save writes the emptiness back.
              minimumTermMonths: '@event.payload.minimum_term_months',
              noticeDays: '@event.payload.notice_days',
              credits: '@event.payload.credits',
              validDays: '@event.payload.valid_days',
              joiningFeeId: '@event.payload.joining_fee_id',
              blocked: false,
              planHeld: '@event.payload.held_count',
            },
          },
        },
      ],
    },
    { event: 'ui:click', ref: 'addCourse', do: [{ push: { action: 'courses.form', canvas: 'sheet', with: ['sheet'], input: { heading: 'Add a course block' } } }] },
    {
      event: 'ui:click',
      ref: 'editCourse',
      do: [
        {
          push: {
            action: 'courses.form',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              heading: 'Edit course block',
              courseId: '@event.payload.course_id',
              offeringId: '@event.payload.offering_id',
              programId: '@event.payload.program_id',
              name: '@event.payload.name',
              blurb: '@event.payload.blurb',
              startsOn: '@event.payload.starts_on',
              endsOn: '@event.payload.ends_on',
              capacity: '@event.payload.capacity',
              priceCents: '@event.payload.price_cents',
            },
          },
        },
      ],
    },
    { message: 'plans-changed', do: [{ call: 'load' }] },
    { message: 'courses-changed', do: [{ call: 'courses' }] },
  ],
};

export const plansInputSchema = z.toJSONSchema(z.object({}));

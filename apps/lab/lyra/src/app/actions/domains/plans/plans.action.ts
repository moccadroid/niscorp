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
              // The same rule, and this one was already being broken: the fee a
              // plan names is written by Save, so opening a plan to fix its
              // name and pressing Save stopped it charging.
              joiningFeeId: '@event.payload.joining_fee_id',
              // A row that exists has a name, so Save is live from the start.
              blocked: false,
              // Which way out this row gets, and the sentence explaining it.
              planHeld: '@event.payload.held_count',
              planHeldLine: '@event.payload.held_display',
            },
          },
        },
      ],
    },
    // ── AND THE BLOCKS, ON THE SAME SCREEN ─────────────────
    //
    // The course form, opened from here. It lives under Schedule too, because a
    // block generates a timetable — but "what do we sell" is this screen's
    // question and a block is one of the answers, so an owner should never have
    // to work out which hub prices a thing.
    //
    // Editing one was reachable from NOWHERE before this: the roster could be
    // read and the block could be created, and nothing could change it.
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
              // The catalogue row holding its price. Save writes both, so a row
              // arriving without this is a save with nowhere to put the money.
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
    // The form announces; this listens. Neither names the other.
    { message: 'plans-changed', do: [{ call: 'load' }] },
    { message: 'courses-changed', do: [{ call: 'courses' }] },
  ],
};

export const plansInputSchema = z.toJSONSchema(z.object({}));

import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { reportsLayout } from './reports.layout';
import { attendanceByHourPrism, attendanceByProgramPrism, attendanceByWeekPrism, membersByStatusPrism, planUptakePrism } from './reports.prism';

export const reportsAction: ActionDefinition = {
  id: 'reports.overview',
  title: 'Reports',
  data: {
    // Seeded by the server: two studios on different dates do not agree on what
    // "the last 90 days" ends on.
    from: '',
    to: '',
    rangeLabel: 'Last 90 days',
    // The span the window fn reads. A `call` carries no arguments; a fn is
    // handed the action's data, so "which period" is a value like any other.
    days: 90,

    byHour: [],
    byWeek: [],
    byProgram: [],
    windowRow: {},
    byStatus: [],
    uptake: [],
    loading: true,
  },
  layout: reportsLayout,
  endpoints: {
    window: { fn: 'reports.window', target: 'windowRow' },
    hours: { url: '/api/schedule/vex', method: 'POST', request: attendanceByHourPrism, target: 'byHour' },
    weeks: { url: '/api/schedule/vex', method: 'POST', request: attendanceByWeekPrism, target: 'byWeek' },
    programs: { url: '/api/schedule/vex', method: 'POST', request: attendanceByProgramPrism, target: 'byProgram' },
    statuses: { url: '/api/member/vex', method: 'POST', request: membersByStatusPrism, target: 'byStatus' },
    uptake: { url: '/api/studio/vex', method: 'POST', request: planUptakePrism, target: 'uptake' },
  },
  lifecycle: {
    mount: [
      {
        call: 'window',
        onSuccess: [
          { set: 'from', value: '$.windowRow.from' },
          { set: 'to', value: '$.windowRow.to' },
          { set: 'rangeLabel', value: '$.windowRow.label' },
          { call: 'hours' },
          { call: 'weeks' },
          { call: 'programs' },
        ],
      },
      { call: 'uptake' },
      { call: 'statuses', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  // A check-in or a sign-up moves these figures, so the page listens rather
  // than being told.
  triggers: [
    // Three presets, three refs, no branch. The `set` lands first: a `call`
    // before it would send the previous period.
    {
      event: 'ui:click',
      ref: 'range-30',
      do: [
        { set: 'days', value: 30 },
        {
          call: 'window',
          onSuccess: [
          { set: 'from', value: '$.windowRow.from' },
          { set: 'to', value: '$.windowRow.to' },
          { set: 'rangeLabel', value: '$.windowRow.label' },
          { call: 'hours' },
          { call: 'weeks' },
          { call: 'programs' },
          ],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'range-90',
      do: [
        { set: 'days', value: 90 },
        {
          call: 'window',
          onSuccess: [
          { set: 'from', value: '$.windowRow.from' },
          { set: 'to', value: '$.windowRow.to' },
          { set: 'rangeLabel', value: '$.windowRow.label' },
          { call: 'hours' },
          { call: 'weeks' },
          { call: 'programs' },
          ],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'range-365',
      do: [
        { set: 'days', value: 365 },
        {
          call: 'window',
          onSuccess: [
          { set: 'from', value: '$.windowRow.from' },
          { set: 'to', value: '$.windowRow.to' },
          { set: 'rangeLabel', value: '$.windowRow.label' },
          { call: 'hours' },
          { call: 'weeks' },
          { call: 'programs' },
          ],
        },
      ],
    },

    { message: 'check-ins-changed', do: [{ call: 'hours' }, { call: 'weeks' }, { call: 'programs' }] },
    { message: 'members-changed', do: [{ call: 'statuses' }, { call: 'uptake' }] },
  ],
};

export const reportsInputSchema = z.toJSONSchema(z.object({}));

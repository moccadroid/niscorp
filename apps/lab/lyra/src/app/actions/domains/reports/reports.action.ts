import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { reportsLayout } from './reports.layout';
import { attendanceByHourPrism, attendanceByProgramPrism, attendanceByWeekPrism, membersByStatusPrism, planUptakePrism } from './reports.prism';

// What the studio looks like from above.
//
// Five grouped reads, all fired on mount and all independent — none of these
// figures depends on another, and chaining them would let the slowest decide
// when any of the page appears.
//
// Manager and owner only, by ring 1 and by ring 3 both: the reads touch
// `subscriptions`, which is the grant that separates what a studio SELLS from
// what it EARNS.
export const reportsAction: ActionDefinition = {
  id: 'reports.overview',
  title: 'Reports',
  data: {
    // THE WINDOW, seeded by the server. A date range that defaulted to something
    // the browser computed would be the studio-clock bug again — a studio in
    // Kiritimati and one in Niue do not agree on what "the last 90 days" ends on.
    // `nav.identity` already resolves the studio's own day; these come with it.
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
    // THE WINDOW FIRST, and everything else inside its `onSuccess`.
    //
    // The three attendance reads take `from` and `to` as context; firing them
    // beside the call that resolves those dates would send two empty strings and
    // return nothing, on every mount, silently.
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
    // THREE PRESETS, THREE REFS, no branch — the same shape the roll's two slice
    // buttons use. Each sets the span, then re-resolves the window and re-reads
    // the three charts that take it. The `set` lands first: a `call` before it
    // would send the previous period.
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

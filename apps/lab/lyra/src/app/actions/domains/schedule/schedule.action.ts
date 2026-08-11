import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { timetableLayout } from './schedule.layout';
import { programsPrism, upcomingPrism } from './schedule.prism';

// The timetable — what is on, and how full it is.
//
// Granted at the MEMBER rung, so a member holds this surface with no special
// case anywhere: the schedule is the one thing everybody at a studio can see,
// and it carries nobody's personal data.
export const scheduleTimetableAction: ActionDefinition = {
  id: 'schedule.timetable',
  title: 'Timetable',
  data: {
    sessions: [],
    programs: [],
    loading: true,
    // The calendar is the default. Somebody opening a timetable is looking at
    // a week, not reading a feed.
    calendar: true,
    // The chosen view, and the two on offer. `calendar` stays a boolean because
    // that is what the layout's `if` reads; the option carries it, so the tab
    // sets both without anything branching.
    view: 'calendar',
    views: [
      { value: 'calendar', label: 'Calendar', calendar: true },
      { value: 'list', label: 'List', calendar: false },
    ],
    weekSkip: 0,
  },
  layout: timetableLayout,
  endpoints: {
    load: { url: '/api/schedule/vex', method: 'POST', request: upcomingPrism, target: 'sessions' },
    loadPrograms: { url: '/api/schedule/vex', method: 'POST', request: programsPrism, target: 'programs' },
  },
  lifecycle: {
    mount: [
      { call: 'loadPrograms' },
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [
    // ONE trigger for the whole stepper: the arrow carries where it is going.
    { event: 'ui:click', ref: 'stepWeek', do: [{ set: 'weekSkip', value: '@event.payload.skip' }] },
    { event: 'ui:click', ref: 'view', do: [{ set: 'view', value: '@event.payload.value' }, { set: 'calendar', value: '@event.payload.calendar' }] },
    // Into the sheet, over the calendar — the same reason a form goes there.
    //
    // This used to push `desk.checkin`, which is the wrong screen for the
    // gesture: tapping a class on a fortnight's calendar asks "who is coming to
    // THIS", and the check-in tool answers "who has arrived TODAY" with its own
    // class picker stacked inside the sheet. Same tap, right answer now.
    { event: 'ui:click', ref: 'openSession', do: [{ push: { action: 'schedule.session', canvas: 'sheet', with: ['sheet'], input: { sessionId: '@event.payload.session_id' } } }] },
    { message: 'sessions-changed', do: [{ call: 'load' }] },
  ],
};

export const scheduleTimetableInputSchema = z.toJSONSchema(z.object({}));

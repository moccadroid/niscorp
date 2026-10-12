import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { timetableLayout } from './schedule.layout';
import { localePrism, programsPrism, upcomingPrism } from './schedule.prism';

export const scheduleTimetableAction: ActionDefinition = {
  id: 'schedule.timetable',
  title: 'Timetable',
  data: {
    sessions: [],
    programs: [],
    loading: true,
    calendar: true,
    view: 'calendar',
    views: [
      { value: 'calendar', label: 'Calendar', calendar: true },
      { value: 'list', label: 'List', calendar: false },
    ],
    weekSkip: 0,
    currentLocale: '',
  },
  layout: timetableLayout,
  endpoints: {
    load: { url: '/api/schedule/vex', method: 'POST', request: upcomingPrism, target: 'sessions' },
    loadPrograms: { url: '/api/schedule/vex', method: 'POST', request: programsPrism, target: 'programs' },
    locale: { url: '/api/schedule/vex', method: 'POST', request: localePrism, target: 'localeRow' },
  },
  lifecycle: {
    mount: [
      { call: 'loadPrograms' },
      { call: 'locale', onSuccess: [{ set: 'currentLocale', value: '$.localeRow.locale' }] },
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'stepWeek', do: [{ set: 'weekSkip', value: '@event.payload.skip' }] },
    { event: 'ui:click', ref: 'view', do: [{ set: 'view', value: '@event.payload.value' }, { set: 'calendar', value: '@event.payload.calendar' }] },
    { event: 'ui:click', ref: 'openSession', do: [{ push: { action: 'schedule.session', canvas: 'sheet', with: ['sheet'], input: { sessionId: '@event.payload.session_id' } } }] },
    { message: 'sessions-changed', do: [{ call: 'load' }] },
  ],
};

export const scheduleTimetableInputSchema = z.toJSONSchema(z.object({}));

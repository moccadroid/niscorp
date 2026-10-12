import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { attendanceNowLayout } from './attendance-now.layout';
import { attendanceTotalPrism, attendanceByZonePrism } from './live.prism';
import { dayField, hourField } from '@encore/app/actions/shared/input-fields';

export const attendanceNowAction: ActionDefinition = {
  id: 'attendance.now',
  title: 'On site',
  description: 'How many people are on site right now — total attendance against the capacity of the whole site, with how full each zone is; open it when someone asks how many guests, people, attendees or visitors there are, how busy it is, or how full the festival is.',
  data: { day: 'sat', hour: 18, total: {}, zones: [], loading: true },
  layout: attendanceNowLayout,
  endpoints: {
    load: { url: '/api/site/vex', method: 'POST', request: attendanceTotalPrism, target: 'total' },
    loadZones: { url: '/api/site/vex', method: 'POST', request: attendanceByZonePrism, target: 'zones' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ call: 'loadZones', onSuccess: [{ set: 'loading', value: false }] }] }] },
};

export const attendanceNowInputSchema = z.toJSONSchema(
  z.object({
    day: dayField.optional(),
    hour: hourField.optional(),
  }),
);

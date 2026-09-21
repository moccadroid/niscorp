import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { attendanceNowLayout } from './attendance-now.layout';
import { attendanceTotalPrism, attendanceByZonePrism } from './live.prism';
import { dayField, hourField } from '@encore/app/actions/shared/input-fields';

// HOW MANY PEOPLE ARE HERE? — the plainest question an ops tent gets asked, and
// the one the room could not answer. `crowd.gauge` needs a ZONE, so a sentence
// that names none left it as a chip and the screen empty: the operator asked a
// whole-site question and was offered a per-zone instrument.
//
// So this card takes no row at all. It is aimed only in time — the festival
// clock's hour unless the sentence says another — which means nothing about it
// is ever unsure enough to demote it: if Jev wants it, it mounts.
//
// Two reads: the site total against the site's capacity (the dial), and every
// zone's share of it (the list), so the follow-up question — "where are they
// all?" — is answered before it is asked.
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

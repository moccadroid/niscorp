import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { situationNowLayout } from './situation-now.layout';
import { attendanceByZonePrism, delaysRecentPrism, incidentsOpenPrism, onStagePrism, weatherWarningsPrism } from './live.prism';
import { dayField, hourField } from '@encore/app/actions/shared/input-fields';

// "WHAT'S GOING ON?" — answered by a card, first.
//
// A room that can only answer a question in words is a chatbot with a nice
// frame. So the broadest question an ops tent gets has a card Jev can open
// ALONE, in the pass, a third of a second after the thought settles: who is on
// and who is next, the weather about to arrive, what is open, what has been
// held, where the crowd is. The text model's sentences arrive seconds later as
// the second layer — and are read from these same fingerprints (the
// `situation` context pack), so the words and the card cannot disagree.
//
// Aimed only in time, like `attendance.now`: it takes no row, so nothing can
// demote it to a chip.
export const situationNowAction: ActionDefinition = {
  id: 'situation.now',
  title: 'Right now',
  description: 'What is going on across the whole site right now — who is on stage and who is up next, bad weather due in the next three hours, open incidents, holds called on sets and the fullest zones; open it when someone asks what is going on, what is happening, or for a status or an overview.',
  data: { day: 'sat', hour: 18, onStage: [], warnings: [], incidents: [], holds: [], zones: [], loading: true },
  layout: situationNowLayout,
  endpoints: {
    loadStage: { url: '/api/lineup/vex', method: 'POST', request: onStagePrism, target: 'onStage' },
    loadWarnings: { url: '/api/readings/vex', method: 'POST', request: weatherWarningsPrism, target: 'warnings' },
    loadIncidents: { url: '/api/readings/vex', method: 'POST', request: incidentsOpenPrism, target: 'incidents' },
    loadHolds: { url: '/api/lineup/vex', method: 'POST', request: delaysRecentPrism, target: 'holds' },
    loadZones: { url: '/api/site/vex', method: 'POST', request: attendanceByZonePrism, target: 'zones' },
  },
  // Five independent sections, five independent loads: one slow read holds up
  // its own list and nothing else.
  lifecycle: {
    mount: [{ call: 'loadStage', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadWarnings' }, { call: 'loadIncidents' }, { call: 'loadHolds' }, { call: 'loadZones' }],
  },
  triggers: [
  ],
};

export const situationNowInputSchema = z.toJSONSchema(
  z.object({
    day: dayField.optional(),
    hour: hourField.optional(),
  }),
);

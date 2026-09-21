import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { weatherRadarLayout } from './weather-radar.layout';
import { weatherForDayPrism, weatherAtHourPrism } from './live.prism';
import { dayField, hourField } from '@encore/app/actions/shared/input-fields';

// The weather, AIMED at an hour. "storm at 9" is a question about 21:00, not
// about the weather in general — so the hour is an input, the parser fills it
// from the sentence, and the card opens already pointing at the cell.
//
// Two reads: the day's shape (the bars) and the one hour being asked about
// (the figures). Both are keyed on inputs, so a new hour re-mounts the card —
// which is right: a radar still showing 18:00 under a 21:00 heading is the
// stale-record bug reconcile's re-aim rule exists to prevent.
export const weatherRadarAction: ActionDefinition = {
  id: 'weather.radar',
  title: 'Weather',
  description: 'The weather radar aimed at one hour — rain, wind and storm cells across the day, with the asked-about hour marked; open it when weather, rain, wind, lightning or a storm is mentioned.',
  data: { day: 'sat', hour: 18, hours: [], at: {}, loading: true },
  layout: weatherRadarLayout,
  endpoints: {
    load: { url: '/api/readings/vex', method: 'POST', request: weatherForDayPrism, target: 'hours' },
    loadAt: { url: '/api/readings/vex', method: 'POST', request: weatherAtHourPrism, target: 'at' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ call: 'loadAt', onSuccess: [{ set: 'loading', value: false }] }] }] },
};

export const weatherRadarInputSchema = z.toJSONSchema(
  z.object({
    day: dayField.optional(),
    hour: hourField.optional(),
  }),
);

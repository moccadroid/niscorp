import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { weatherRadarLayout } from './weather-radar.layout';
import { weatherForDayPrism, weatherAtHourPrism } from './live.prism';
import { dayField, hourField } from '@encore/app/actions/shared/input-fields';

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

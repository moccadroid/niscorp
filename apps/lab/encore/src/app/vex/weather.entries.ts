import type { SeedEntry } from '@niscorp/vex';

export const weatherForDay: SeedEntry = {
  fingerprint: 'weather/forDay',
  intent: 'Hourly weather for one festival day',
  shape: [{ hour: 0, condition: '', rain_mm: 0, wind_kph: 0, severity: 0 }],
  dsl: {
    from: ['weather_hours'],
    fields: ['weather_hours.hour', 'weather_hours.condition', 'weather_hours.rain_mm', 'weather_hours.wind_kph', 'weather_hours.severity'],
    filter: { eq: ['weather_hours.day', { $context: 'day' }] },
    sort: [{ field: 'weather_hours.hour', dir: 'asc' }],
    limit: 30,
  },
};

export const weatherAtHour: SeedEntry = {
  fingerprint: 'weather/atHour',
  intent: 'The weather at one hour of one festival day',
  shape: { hour: 0, condition: '', rain_mm: 0, wind_kph: 0, severity: 0 },
  dsl: {
    from: ['weather_hours'],
    fields: ['weather_hours.hour', 'weather_hours.condition', 'weather_hours.rain_mm', 'weather_hours.wind_kph', 'weather_hours.severity'],
    filter: {
      and: [
        { eq: ['weather_hours.day', { $context: 'day' }] },
        { eq: ['weather_hours.hour', { $context: 'hour' }] },
      ],
    },
    limit: 1,
  },
};

export const weatherWindow: SeedEntry = {
  fingerprint: 'weather/window',
  intent: 'Hourly weather for one festival day between two hours, inclusive',
  shape: [{ hour: 0, condition: '', rain_mm: 0, wind_kph: 0, severity: 0 }],
  dsl: {
    from: ['weather_hours'],
    fields: ['weather_hours.hour', 'weather_hours.condition', 'weather_hours.rain_mm', 'weather_hours.wind_kph', 'weather_hours.severity'],
    filter: {
      and: [
        { eq: ['weather_hours.day', { $context: 'day' }] },
        { gte: ['weather_hours.hour', { $context: 'fromHour' }] },
        { lte: ['weather_hours.hour', { $context: 'toHour' }] },
      ],
    },
    sort: [{ field: 'weather_hours.hour', dir: 'asc' }],
    limit: 12,
  },
};

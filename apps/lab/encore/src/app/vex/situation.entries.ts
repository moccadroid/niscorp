import type { SeedEntry } from '@niscorp/vex';

// What is happening, as reads. Each of these backs a section of `situation.now`
// (or the whole of `incident.feed`) AND a context pack — on purpose the same
// fingerprints, so the sentence the text model writes about the site and the
// card standing beside it were read from the same rows and cannot disagree.

// Sets that overlap a window of the day: on stage now, and up next. Minutes of
// the day on both bounds, so "now" is one number the caller derives from an
// hour.
export const lineupAround: SeedEntry = {
  fingerprint: 'lineup/around',
  intent: 'Sets on one festival day that are still running at or start within a window of minutes, by stage then time',
  shape: [{ slot_id: '', act_id: '', act_name: '', billing: '', stage_id: '', stage_name: '', starts_at: '', start_min: 0, end_min: 0 }],
  dsl: {
    from: ['slots', 'acts', 'stages'],
    fields: [
      { field: 'slots.id', as: 'slot_id' },
      // The ids ride along so that whoever is handed these rows can NAME them: the
      // assistant knows who is on stage from here, and may aim the act's card at her.
      { field: 'acts.id', as: 'act_id' },
      { field: 'acts.name', as: 'act_name' },
      'acts.billing',
      { field: 'stages.id', as: 'stage_id' },
      { field: 'stages.name', as: 'stage_name' },
      'slots.starts_at',
      'slots.start_min',
      'slots.end_min',
    ],
    filter: {
      and: [
        { eq: ['slots.day', { $context: 'day' }] },
        { gt: ['slots.end_min', { $context: 'fromMin' }] },
        { lte: ['slots.start_min', { $context: 'toMin' }] },
      ],
    },
    sort: [
      { field: 'slots.start_min', dir: 'asc' },
      { field: 'stages.capacity', dir: 'desc' },
    ],
    limit: 12,
  },
};

// Hours in a window that are worse than fair: severity 1 and up.
export const weatherWarnings: SeedEntry = {
  fingerprint: 'weather/warnings',
  intent: 'Hours of one festival day, between two hours, whose weather severity is at least 1',
  shape: [{ hour: 0, condition: '', rain_mm: 0, wind_kph: 0, severity: 0 }],
  dsl: {
    from: ['weather_hours'],
    fields: ['weather_hours.hour', 'weather_hours.condition', 'weather_hours.rain_mm', 'weather_hours.wind_kph', 'weather_hours.severity'],
    filter: {
      and: [
        { eq: ['weather_hours.day', { $context: 'day' }] },
        { gte: ['weather_hours.hour', { $context: 'fromHour' }] },
        { lte: ['weather_hours.hour', { $context: 'toHour' }] },
        { gte: ['weather_hours.severity', 1] },
      ],
    },
    sort: [{ field: 'weather_hours.hour', dir: 'asc' }],
    limit: 8,
  },
};

// Day then time, both as text: 'fri' < 'sat' < 'sun' happens to be the order
// the festival runs in, and 'HH:MM' sorts as a clock does.
export const incidentsOpen: SeedEntry = {
  fingerprint: 'incidents/open',
  intent: 'Open incidents with the zone they are in, newest first',
  shape: [{ incident_id: '', day: '', at: '', kind: '', severity: 0, summary: '', zone_name: '' }],
  dsl: {
    from: ['incidents', 'zones'],
    fields: [{ field: 'incidents.id', as: 'incident_id' }, 'incidents.day', 'incidents.at', 'incidents.kind', 'incidents.severity', 'incidents.summary', { field: 'zones.name', as: 'zone_name' }],
    filter: { eq: ['incidents.status', 'open'] },
    sort: [
      { field: 'incidents.day', dir: 'desc' },
      { field: 'incidents.at', dir: 'desc' },
    ],
    limit: 20,
  },
};

export const delaysRecent: SeedEntry = {
  fingerprint: 'delays/recent',
  intent: 'The most recent holds called on sets, with the act each was called on',
  shape: [{ delay_id: '', act_name: '', minutes: 0, created_by: '' }],
  dsl: {
    from: ['delays', 'acts'],
    fields: [{ field: 'delays.id', as: 'delay_id' }, { field: 'acts.name', as: 'act_name' }, 'delays.minutes', 'delays.created_by'],
    sort: [{ field: 'delays.created_at', dir: 'desc' }],
    limit: 8,
  },
};

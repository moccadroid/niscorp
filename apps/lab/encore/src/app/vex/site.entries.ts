import type { SeedEntry } from '@niscorp/vex';

// The site plan and the crowd on it.

// Every zone with its geometry and how full it is at one hour. `heat` is
// computed HERE, in the query: the map primitive is handed a number between 0
// and 1 and never learns that it means people.
export const zonesHeat: SeedEntry = {
  fingerprint: 'zones/heat',
  intent: 'Every zone with its map rectangle and its fill (headcount over capacity) at one day and hour',
  shape: [{ zone_id: '', name: '', x: 0, y: 0, w: 0, h: 0, headcount: 0, capacity: 0, heat: 0 }],
  dsl: {
    from: ['zones', 'zone_counts'],
    fields: [{ field: 'zones.id', as: 'zone_id' }, 'zones.name', 'zones.x', 'zones.y', 'zones.w', 'zones.h', 'zone_counts.headcount', 'zones.capacity'],
    compute: { heat: { divide: ['zone_counts.headcount', 'zones.capacity'] } },
    filter: {
      and: [
        { eq: ['zone_counts.day', { $context: 'day' }] },
        { eq: ['zone_counts.hour', { $context: 'hour' }] },
      ],
    },
    sort: [{ field: 'zones.capacity', dir: 'desc' }],
    limit: 20,
  },
};

export const zoneCount: SeedEntry = {
  fingerprint: 'zones/count',
  intent: 'Headcount against capacity for one zone at one day and hour',
  shape: { zone_id: '', name: '', headcount: 0, capacity: 0 },
  dsl: {
    from: ['zones', 'zone_counts'],
    fields: [{ field: 'zones.id', as: 'zone_id' }, 'zones.name', 'zone_counts.headcount', 'zones.capacity'],
    filter: {
      and: [
        { eq: ['zones.id', { $context: 'zoneId' }] },
        { eq: ['zone_counts.day', { $context: 'day' }] },
        { eq: ['zone_counts.hour', { $context: 'hour' }] },
      ],
    },
    limit: 1,
  },
};

// ─── the whole site ──────────────────────────────────────────

// Everybody on site at one hour against everything the site can hold: two sums
// over the same join, one row. No `groupBy` on purpose — the question is about
// the site, not about its zones.
export const attendanceTotal: SeedEntry = {
  fingerprint: 'attendance/total',
  intent: 'Total headcount across every zone against total capacity, at one day and hour',
  shape: { headcount: 0, capacity: 0 },
  dsl: {
    from: ['zones', 'zone_counts'],
    aggregate: { headcount: { sum: 'zone_counts.headcount' }, capacity: { sum: 'zones.capacity' } },
    filter: {
      and: [
        { eq: ['zone_counts.day', { $context: 'day' }] },
        { eq: ['zone_counts.hour', { $context: 'hour' }] },
      ],
    },
  },
};

const zoneField = (key: string): Record<string, unknown> => ({ $get: { from: { $var: 'zone' }, path: [key] } });
const zoneFill = { $div: [zoneField('headcount'), zoneField('capacity')] };

// Each zone's share, fullest first. The MAPPING words the fill ("90%") — that is
// formatting, and formatting lives here, upstream of every layout (rule 9), so
// the card's list names a key and the kit's List never learns what a
// percentage is.
export const attendanceByZone: SeedEntry = {
  fingerprint: 'attendance/byZone',
  intent: 'Headcount, capacity and fill for every zone at one day and hour, busiest first',
  shape: [{ zone_id: '', name: '', headcount: 0, capacity: 0, fill: 0, fill_display: '' }],
  dsl: {
    from: ['zones', 'zone_counts'],
    fields: [{ field: 'zones.id', as: 'zone_id' }, 'zones.name', 'zone_counts.headcount', 'zones.capacity'],
    filter: {
      and: [
        { eq: ['zone_counts.day', { $context: 'day' }] },
        { eq: ['zone_counts.hour', { $context: 'hour' }] },
      ],
    },
    sort: [{ field: 'zone_counts.headcount', dir: 'desc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'zone',
      body: {
        zone_id: zoneField('zone_id'),
        name: zoneField('name'),
        headcount: zoneField('headcount'),
        capacity: zoneField('capacity'),
        fill: { $round: { value: zoneFill, digits: 2 } },
        fill_display: { $join: { parts: [{ $round: { value: { $mul: [zoneFill, 100] } } }, '% full'], sep: '' } },
      },
    },
  },
};

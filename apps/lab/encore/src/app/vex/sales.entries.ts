import type { SeedEntry } from '@niscorp/vex';

// Ticket and bar takings. `days` is a LIST so one plan serves "today" and "the
// whole weekend": the chart's range is which days it sends, not which entry it
// replays. Both metrics ride every row — which one the bars draw is the
// chart's `valueKey`, a layout binding, so flipping units ↔ revenue re-reads
// nothing.

export const salesHourly: SeedEntry = {
  fingerprint: 'sales/hourly',
  intent: 'Hourly units and revenue for one kind of sale across the given days',
  shape: [{ day: '', hour: 0, units: 0, revenue: 0 }],
  dsl: {
    from: ['sales_hourly'],
    fields: ['sales_hourly.day', 'sales_hourly.hour', 'sales_hourly.units', 'sales_hourly.revenue'],
    filter: {
      and: [
        { eq: ['sales_hourly.kind', { $context: 'kind' }] },
        { in: ['sales_hourly.day', { $context: 'days' }] },
      ],
    },
    sort: [
      { field: 'sales_hourly.day', dir: 'asc' },
      { field: 'sales_hourly.hour', dir: 'asc' },
    ],
    limit: 60,
  },
};

export const salesDaily: SeedEntry = {
  fingerprint: 'sales/daily',
  intent: 'Units and revenue per festival day for one kind of sale across the given days',
  shape: [{ day: '', units: 0, revenue: 0 }],
  dsl: {
    from: ['sales_hourly'],
    fields: ['sales_hourly.day'],
    aggregate: { units: { sum: 'sales_hourly.units' }, revenue: { sum: 'sales_hourly.revenue' } },
    groupBy: ['sales_hourly.day'],
    filter: {
      and: [
        { eq: ['sales_hourly.kind', { $context: 'kind' }] },
        { in: ['sales_hourly.day', { $context: 'days' }] },
      ],
    },
    sort: [{ field: 'sales_hourly.day', dir: 'asc' }],
    limit: 10,
  },
};

// One day's takings, one row per kind of sale — the money picture in two rows.
export const salesDayTotals: SeedEntry = {
  fingerprint: 'sales/dayTotals',
  intent: 'Units and revenue for one festival day, per kind of sale',
  shape: [{ kind: '', units: 0, revenue: 0 }],
  dsl: {
    from: ['sales_hourly'],
    fields: ['sales_hourly.kind'],
    aggregate: { units: { sum: 'sales_hourly.units' }, revenue: { sum: 'sales_hourly.revenue' } },
    groupBy: ['sales_hourly.kind'],
    filter: { eq: ['sales_hourly.day', { $context: 'day' }] },
    sort: [{ field: 'sales_hourly.kind', dir: 'asc' }],
    limit: 4,
  },
};

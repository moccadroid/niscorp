// Presentation fragments, authored into the cache entries' Prism mappings.
//
// Formatting lives in the mapping, on the way OUT of Vex — never in TypeScript
// and never in a component (rule 9). Each helper takes the raw value NODE (a
// row field expression) and returns a Prism subtree.
//
// Loosely typed on purpose: Prism configs are an open union and `compile` takes
// `unknown`, so call sites need no assertions.

/** A date the way a timetable writes one: "Fri 14 Mar". Absent → an em dash. */
export const dateText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'ddd D MMM' } } }],
    else: '—',
  },
});

/** Just the weekday and day: "Fri 14". For a column that already says the month. */
export const dayText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'ddd D' } } }],
    else: '—',
  },
});

/** A timestamp for a feed: "14 Mar, 18:40". */
export const stampText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'D MMM, HH:mm' } } }],
    else: '—',
  },
});

// Money. Stored in cents because floating-point money is a bug waiting for a
// quarterly report; divided and rounded here, on the way out.
//
// Absent is €0, not a crash: a SUM over no rows is NULL, and a studio with
// nothing sold yet is an ordinary Tuesday.
export const money = (cents: unknown) => ({
  $case: {
    branches: [{ when: cents, then: { $join: { parts: ['€', { $round: { value: { $div: [cents, 100] }, digits: 0 } }], sep: '' } } }],
    else: '€0',
  },
});

/** Money with cents, for a price list where 89.50 matters. */
export const priceText = (cents: unknown) => ({
  $case: {
    branches: [{ when: cents, then: { $join: { parts: ['€', { $round: { value: { $div: [cents, 100] }, digits: 2 } }], sep: '' } } }],
    else: '€0',
  },
});

/** A membership status as something a person would say. */
export const statusText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'active'] }, then: 'Active' },
      { when: { $eq: [value, 'trialling'] }, then: 'Trial' },
      { when: { $eq: [value, 'paused'] }, then: 'Paused' },
      { when: { $eq: [value, 'lapsed'] }, then: 'Lapsed' },
      { when: { $eq: [value, 'cancelled'] }, then: 'Cancelled' },
    ],
    else: value,
  },
});

// The tone a status wears. A TOKEN name, never a colour — the layout hands it
// to `Badge.tone` and the kit resolves it, so a theme restyles every status in
// the application without touching a query.
//
// Lapsed is `alert` and cancelled is `neutral` on purpose: a lapsed member is a
// problem somebody should act on today, a cancelled one is history.
export const statusTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'active'] }, then: 'good' },
      { when: { $eq: [value, 'trialling'] }, then: 'accent' },
      { when: { $eq: [value, 'paused'] }, then: 'warm' },
      { when: { $eq: [value, 'lapsed'] }, then: 'alert' },
    ],
    else: 'neutral',
  },
});

/** A class time from the stored "18:30". Already a string; this is where a 12-hour studio would diverge. */
export const timeText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: value }],
    else: '—',
  },
});

/** "12 of 20" — a fill figure a person can read at a glance. */
export const fillText = (booked: unknown, capacity: unknown) => ({
  $join: { parts: [{ $coalesce: [booked, 0] }, ' of ', { $coalesce: [capacity, 0] }], sep: '' },
});

// How full a class is, as a tone. Near-full is `warm` rather than `alert`: a
// full class is a good problem, and painting it red teaches the front desk to
// ignore red.
export const fillTone = (booked: unknown, capacity: unknown) => ({
  $case: {
    branches: [
      { when: { $gte: [{ $coalesce: [booked, 0] }, { $coalesce: [capacity, 1] }] }, then: 'warm' },
      { when: { $eq: [{ $coalesce: [booked, 0] }, 0] }, then: 'neutral' },
    ],
    else: 'good',
  },
});

/** A cancelled session says so; everything else says when it starts. */
export const sessionStateText = (status: unknown, time: unknown) => ({
  $case: {
    branches: [{ when: { $eq: [status, 'cancelled'] }, then: 'Cancelled' }],
    else: time,
  },
});

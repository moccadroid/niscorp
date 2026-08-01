// Presentation fragments authored into the cache entries' Prism mappings —
// formatting lives in the mapping, on the way out of Vex, never in TypeScript and
// never in a component. Each takes the raw value NODE (a row field expression)
// and returns a Prism subtree. Loosely typed on purpose: Prism configs are an
// open union and `compile` takes `unknown`, so call sites need no casts.

// A date the way a hotel writes one: "Fri 14 Mar". Empty → an em dash.
export const dateText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'ddd D MMM' } } }],
    else: '—',
  },
});

// A timestamp for a feed: "14 Mar, 18:40".
export const stampText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'D MMM, HH:mm' } } }],
    else: '—',
  },
});

// Money on a folio — grouped, no cents, currency in front. Hotel bills are whole
// numbers on screen; the raw value stays raw for anything that has to add up.
//
// Absent is €0, not a crash: `SUM` over no rows is NULL, and a stay with
// nothing posted yet is an ordinary Tuesday. (A real zero takes the same
// branch and prints the same thing, so the distinction costs nothing.)
export const money = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $join: { parts: ['€', { $round: { value, digits: 0 } }], sep: '' } } }],
    else: '€0',
  },
});

// The stay's state as something a person would say.
export const stateText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'in_house'] }, then: 'In house' },
      { when: { $eq: [value, 'arriving'] }, then: 'Arriving today' },
      { when: { $eq: [value, 'booked'] }, then: 'Booked' },
      { when: { $eq: [value, 'departed'] }, then: 'Checked out' },
    ],
    else: value,
  },
});

// Why a slot is dark, in words the ops manager and the vendor both use. The
// resolver decided this; we are only spelling it.
export const reasonText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'live'] }, then: 'Live' },
      { when: { $eq: [value, 'connector'] }, then: 'Not in the live integration' },
      { when: { $eq: [value, 'property'] }, then: 'Switched off by the property' },
      // Ours, estate-wide — the surface itself is retired, at every hotel, and
      // no amount of switching at a connector or a property brings it back.
      { when: { $eq: [value, 'disabled'] }, then: 'Withdrawn by Atrium' },
      // Shipped by an integration this hotel does not run — two vendors can
      // implement one capability, and each ships its own surface.
      { when: { $eq: [value, 'source'] }, then: 'From an integration this hotel does not run' },
    ],
    else: value,
  },
});

// Tones. A chip's colour is a resolved field, never a decision a layout makes:
// the mapping hands down `*_tone` and the component looks it up.
export const reasonTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'live'] }, then: 'good' },
      { when: { $eq: [value, 'connector'] }, then: 'warn' },
      { when: { $eq: [value, 'disabled'] }, then: 'alert' },
    ],
    else: 'neutral',
  },
});

export const statusTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'open'] }, then: 'warn' },
      { when: { $eq: [value, 'resolved'] }, then: 'good' },
      { when: { $eq: [value, 'done'] }, then: 'good' },
    ],
    else: 'neutral',
  },
});

export const severityTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'high'] }, then: 'alert' },
      { when: { $eq: [value, 'normal'] }, then: 'warn' },
    ],
    else: 'neutral',
  },
});

// A room's status in the words the floor uses. `inspected` is the one that
// matters at a counter: clean means housekeeping has finished, inspected means
// somebody signed it off and it can be given to the person in front of you.
export const roomStatusText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'inspected'] }, then: 'Ready' },
      { when: { $eq: [value, 'clean'] }, then: 'Clean' },
      { when: { $eq: [value, 'dirty'] }, then: 'To turn' },
      { when: { $eq: [value, 'out_of_order'] }, then: 'Out of order' },
    ],
    else: value,
  },
});

export const roomStatusTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'inspected'] }, then: 'good' },
      { when: { $eq: [value, 'dirty'] }, then: 'warn' },
      { when: { $eq: [value, 'out_of_order'] }, then: 'alert' },
    ],
    else: 'neutral',
  },
});

// How long ago, said the way a person says it. The figure a stall list lives on:
// "4h" beside an unanswered guest is the entire argument for opening it.
export const sinceText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $lt: [value, 1] }, then: 'just now' },
      { when: { $lt: [value, 60] }, then: { $join: { parts: [{ $round: { value, digits: 0 } }, 'm'], sep: '' } } },
      { when: { $lt: [value, 2880] }, then: { $join: { parts: [{ $round: { value: { $div: [value, 60] }, digits: 0 } }, 'h'], sep: '' } } },
    ],
    else: { $join: { parts: [{ $round: { value: { $div: [value, 1440] }, digits: 0 } }, 'd'], sep: '' } },
  },
});

export const stateTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'in_house'] }, then: 'good' },
      { when: { $eq: [value, 'arriving'] }, then: 'accent' },
      { when: { $eq: [value, 'departed'] }, then: 'neutral' },
    ],
    else: 'neutral',
  },
});

import { salesHourly, salesDaily } from '@encore/app/vex/sales.entries';

// The money card's request seams.
//
// RANGE IS WHICH DAYS GO OVER THE WIRE. `today` sends the card's own day,
// `weekend` sends all three, and both replay the same two plans — so a range
// is a value, never a second entry.
const days = {
  $case: {
    branches: [{ when: { $eq: [{ $ref: '$.range' }, 'weekend'] }, then: ['fri', 'sat', 'sun'] }],
    else: [{ $ref: '$.day' }],
  },
};

// "Compared with what" is the day before, and the first day has no before — it
// compares with itself rather than with nothing, so the overlay is visibly flat
// instead of silently absent.
const dayBefore = {
  $case: {
    branches: [
      { when: { $eq: [{ $ref: '$.day' }, 'sun'] }, then: ['sat'] },
      { when: { $eq: [{ $ref: '$.day' }, 'sat'] }, then: ['fri'] },
    ],
    else: ['fri'],
  },
};

export const salesHourlyPrism = {
  fingerprint: salesHourly.fingerprint,
  context: { kind: { $ref: '$.kind' }, days },
};

export const salesDailyPrism = {
  fingerprint: salesDaily.fingerprint,
  context: { kind: { $ref: '$.kind' }, days },
};

export const salesPreviousPrism = {
  fingerprint: salesHourly.fingerprint,
  context: { kind: { $ref: '$.kind' }, days: dayBefore },
};

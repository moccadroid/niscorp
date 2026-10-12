import { salesHourly, salesDaily } from '@encore/app/vex/sales.entries';

const days = {
  $case: {
    branches: [{ when: { $eq: [{ $ref: '$.range' }, 'weekend'] }, then: ['fri', 'sat', 'sun'] }],
    else: [{ $ref: '$.day' }],
  },
};

// The first day has no day before: it compares with itself rather than with
// nothing, so the overlay is visibly flat instead of silently absent.
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

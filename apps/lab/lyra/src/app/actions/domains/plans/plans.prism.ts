import { offeringsList } from '@lyra/app/vex/member.entries';
import { coursesList } from '@lyra/app/vex/course.entries';
import { offeringCreate, offeringDelete, offeringSetActive, offeringUpdate } from '@lyra/app/vex/reports.entries';

export const oneOffOptionsPrism = { fingerprint: 'offerings/options', context: { kind: 'one_off' } };

export const coursesOnSalePrism = { fingerprint: coursesList.fingerprint, context: {} };

export const plansPrism = {
  fingerprint: offeringsList.fingerprint,
  context: { sortBy: { $ref: '$.sortBy' }, sortDir: { $ref: '$.sortDir' } },
};

const isPass = { $eq: [{ $ref: '$.kind' }, 'pass'] };
const isOneOff = { $eq: [{ $ref: '$.kind' }, 'one_off'] };
const notRecurring = { $or: [isPass, isOneOff] };

const orZero = (path: string): unknown => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: 0 } });
// Null, not zero: no allowance is unlimited and no validity never expires.
const orNull = (path: string): unknown => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: null } });

const KIND_FIELDS = {
  interval: { $case: { branches: [{ when: notRecurring, then: 'month' }], else: { $ref: '$.interval' } } },
  intervalCount: { $case: { branches: [{ when: notRecurring, then: 1 }], else: { $case: { branches: [{ when: { $ref: '$.intervalCount' }, then: { $ref: '$.intervalCount' } }], else: 1 } } } },
  classAllowance: { $case: { branches: [{ when: notRecurring, then: null }], else: orNull('$.classAllowance') } },
  minimumTermMonths: { $case: { branches: [{ when: notRecurring, then: 0 }], else: orZero('$.minimumTermMonths') } },
  noticeDays: { $case: { branches: [{ when: notRecurring, then: 0 }], else: orZero('$.noticeDays') } },
  // A pass with no credits is left to the database's refusal, not defaulted:
  // guessing one would sell a drop-in nobody meant to price.
  credits: { $case: { branches: [{ when: isPass, then: orNull('$.credits') }], else: null } },
  validDays: { $case: { branches: [{ when: isPass, then: orNull('$.validDays') }], else: null } },
  joiningFeeId: { $case: { branches: [{ when: notRecurring, then: null }], else: orNull('$.joiningFeeId') } },
};

export const planCreatePrism = {
  fingerprint: offeringCreate.fingerprint,
  context: { name: { $ref: '$.name' }, kind: { $ref: '$.kind' }, priceCents: { $ref: '$.priceCents' }, ...KIND_FIELDS },
};

export const planUpdatePrism = {
  fingerprint: offeringUpdate.fingerprint,
  context: { offeringId: { $ref: '$.planId' }, name: { $ref: '$.name' }, priceCents: { $ref: '$.priceCents' }, ...KIND_FIELDS },
};

export const planRetirePrism = { fingerprint: offeringSetActive.fingerprint, context: { offeringId: { $ref: '$.planId' }, active: false } };
export const planRestorePrism = { fingerprint: offeringSetActive.fingerprint, context: { offeringId: { $ref: '$.planId' }, active: true } };

export const planDeletePrism = { fingerprint: offeringDelete.fingerprint, context: { offeringId: { $ref: '$.planId' } } };

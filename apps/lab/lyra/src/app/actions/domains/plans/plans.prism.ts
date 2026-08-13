import { offeringsList } from '@lyra/app/vex/member.entries';
import { offeringCreate, offeringSetActive, offeringUpdate } from '@lyra/app/vex/reports.entries';

// The reserved sort keys — see `staff.prism` for why this costs no fingerprint.
export const plansPrism = {
  fingerprint: offeringsList.fingerprint,
  context: { sortBy: { $ref: '$.sortBy' }, sortDir: { $ref: '$.sortDir' } },
};

// A pass has no interval, no allowance and no terms; a plan has no credits.
// The blanks are said HERE, once, so the form can hold both shapes without
// either write carrying fields that mean nothing to its kind.
const isPass = { $eq: [{ $ref: '$.kind' }, 'pass'] };
const KIND_FIELDS = {
  interval: { $case: { branches: [{ when: isPass, then: 'month' }], else: { $ref: '$.interval' } } },
  classAllowance: { $case: { branches: [{ when: isPass, then: null }], else: { $ref: '$.classAllowance' } } },
  minimumTermMonths: { $case: { branches: [{ when: isPass, then: 0 }], else: { $ref: '$.minimumTermMonths' } } },
  noticeDays: { $case: { branches: [{ when: isPass, then: 0 }], else: { $ref: '$.noticeDays' } } },
  credits: { $case: { branches: [{ when: isPass, then: { $ref: '$.credits' } }], else: null } },
  validDays: { $case: { branches: [{ when: isPass, then: { $case: { branches: [{ when: { $ref: '$.validDays' }, then: { $ref: '$.validDays' } }], else: null } } }], else: null } },
};

export const planCreatePrism = {
  fingerprint: offeringCreate.fingerprint,
  context: { name: { $ref: '$.name' }, kind: { $ref: '$.kind' }, priceCents: { $ref: '$.priceCents' }, ...KIND_FIELDS },
};

export const planUpdatePrism = {
  fingerprint: offeringUpdate.fingerprint,
  context: { offeringId: { $ref: '$.planId' }, name: { $ref: '$.name' }, priceCents: { $ref: '$.priceCents' }, ...KIND_FIELDS },
};

// Retire and restore are the same write with the flag flipped, and both are
// updates rather than deletes — which is the whole point of the screen.
// One write either way — the button that fired says which, and the form's own
// `active` is what it is flipping. Two prisms over one entry rather than two
// entries, so the pair cannot drift apart.
export const planRetirePrism = { fingerprint: offeringSetActive.fingerprint, context: { offeringId: { $ref: '$.planId' }, active: false } };
export const planRestorePrism = { fingerprint: offeringSetActive.fingerprint, context: { offeringId: { $ref: '$.planId' }, active: true } };

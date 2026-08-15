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
// A one-off is a name and a price. Everything else about an offering describes
// how it recurs or what it entitles somebody to, and it does neither — so every
// one of those columns is written as its own absence rather than as whatever the
// form was holding when the kind was switched.
const isOneOff = { $eq: [{ $ref: '$.kind' }, 'one_off'] };
const notRecurring = { $or: [isPass, isOneOff] };

// ── WHAT A CLEARED FIELD MEANS, and it differs per column ────
//
// These were fixed menus until the studio was given the pen — five Selects
// holding our guesses about somebody else's business, which excluded the studio
// billing on a 45-day notice period for no reason but that nobody had typed 45
// into a list. A free field can be EMPTY, though, and a Select never could, so
// the meaning of empty has to be stated rather than left to whatever the column
// does with ''.
//
// Zero, for the two that are NOT NULL and where "none" is a real term: no
// minimum is rolling, no notice ends it immediately. An empty box means the
// same thing somebody typing 0 means, and the column spells it 0.
const orZero = (path: string): unknown => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: 0 } });
// NULL, for the two where absence is its own answer the schema already models:
// no allowance is UNLIMITED, no validity NEVER EXPIRES. Neither is zero, and
// writing zero would sell a plan that buys nothing.
const orNull = (path: string): unknown => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: null } });

const KIND_FIELDS = {
  interval: { $case: { branches: [{ when: notRecurring, then: 'month' }], else: { $ref: '$.interval' } } },
  // A pass is bought once, so its period is the column's default rather than
  // whatever the form happened to be holding when the kind was switched.
  // Empty falls to 1: a unit with no count is that unit, once.
  intervalCount: { $case: { branches: [{ when: notRecurring, then: 1 }], else: { $case: { branches: [{ when: { $ref: '$.intervalCount' }, then: { $ref: '$.intervalCount' } }], else: 1 } } } },
  classAllowance: { $case: { branches: [{ when: notRecurring, then: null }], else: orNull('$.classAllowance') } },
  minimumTermMonths: { $case: { branches: [{ when: notRecurring, then: 0 }], else: orZero('$.minimumTermMonths') } },
  noticeDays: { $case: { branches: [{ when: notRecurring, then: 0 }], else: orZero('$.noticeDays') } },
  // A pass with no credit count is not a pass, and the schema says so
  // (`CHECK (kind <> 'pass' OR credits IS NOT NULL)`). Left as the database's
  // refusal rather than defaulted here: guessing "one" for somebody who cleared
  // the field would sell a drop-in they did not mean to price.
  credits: { $case: { branches: [{ when: isPass, then: orNull('$.credits') }], else: null } },
  validDays: { $case: { branches: [{ when: isPass, then: orNull('$.validDays') }], else: null } },
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

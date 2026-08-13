import { coursesList, enrolMember, enrolmentsForMember, withdrawMember } from '@lyra/app/vex/course.entries';
import { personById, offeringsList, peopleList, peopleCount, offeringOptions } from '@lyra/app/vex/member.entries';
import { personAnchorUpdate } from '@lyra/app/vex/member.mutations';
import { peopleEnroll } from '@lyra/app/vex/intake.entries';
import {
  subscriptionForMember,
  subscriptionGiveNotice,
  subscriptionWithdrawNotice,
  subscriptionStart,
  subscriptionRecordPayment,
  subscriptionEnd,
  passSell,
  passesForPerson,
} from '@lyra/app/vex/subscription.entries';

// The wildcards are built HERE because a request prism is evaluated and a
// trigger's `set` is not — a `$join` in a trigger sends the literal expression.
//
// ONE FINGERPRINT, and the lens as a value. The tab used to carry which READ
// it meant; it now carries which lens it means, and the read is the same read.
// Replay-only holds either way — but a lens the caller invents now matches no
// arm and returns nothing, rather than being a fingerprint that does not exist.
//
// `after`/`afterId` are the SEEK: the last row already on screen. Empty means
// the first page, and every name sorts above an empty string. See the roll's
// entry for why this is a seek rather than an offset.
export const peopleListPrism = {
  fingerprint: peopleList.fingerprint,
  context: {
    lens: { $ref: '$.scope' },
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    after: { $ref: '$.after' },
    afterId: { $ref: '$.afterId' },
  },
};

export const peopleCountPrism = {
  fingerprint: peopleCount.fingerprint,
  context: {
    lens: { $ref: '$.scope' },
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
  },
};

// The price list, shaped for choosing — one read, and the screen says which
// kind it is asking for.
export const planOptionsPrism = { fingerprint: offeringOptions.fingerprint, context: { kind: 'recurring' } };
export const passOptionsPrism = { fingerprint: offeringOptions.fingerprint, context: { kind: 'pass' } };

export const personByIdPrism = {
  fingerprint: personById.fingerprint,
  context: { personId: { $ref: '$.personId' } },
};

// The whole signup as one replay — what `members.create` (a server function)
// used to orchestrate. The normalisation the function did (trim, lowercase
// the login identity, '' → NULL for the trial date) happens HERE, in the
// evaluated request, so the entry receives values in the shape the columns
// hold. Idempotent from every starting state — see `people/enroll`.
export const enrollPrism = {
  fingerprint: peopleEnroll.fingerprint,
  context: {
    email: { $lower: { $trim: { $ref: '$.newEmail' } } },
    name: { $trim: { $ref: '$.newName' } },
    phone: { $trim: { $ref: '$.newPhone' } },
    trialEndsOn: { $case: { branches: [{ when: { $eq: [{ $ref: '$.newTrialEndsOn' }, ''] }, then: null }], else: { $ref: '$.newTrialEndsOn' } } },
    source: 'walk-in',
    notes: '',
  },
};

export const personUpdatePrism = {
  fingerprint: personAnchorUpdate.fingerprint,
  context: {
    personId: { $ref: '$.personId' },
    notes: { $ref: '$.notes' },
    trialEndsOn: { $case: { branches: [{ when: { $eq: [{ $ref: '$.trialEndsOn' }, ''] }, then: null }], else: { $ref: '$.trialEndsOn' } } },
  },
};

export const openCoursesPrism = { fingerprint: coursesList.fingerprint, context: {} };
export const memberEnrolmentsPrism = { fingerprint: enrolmentsForMember.fingerprint, context: { personId: { $ref: '$.personId' } } };
export const enrolPrism = { fingerprint: enrolMember.fingerprint, context: { courseId: { $ref: '$.courseId' }, personId: { $ref: '$.personId' } } };
export const withdrawPrism = { fingerprint: withdrawMember.fingerprint, context: { enrolmentId: { $ref: '$.enrolmentId' } } };

// ── what they hold, and granting more of it ──────────────────
//
// A separate read rather than widening `people/byId`: that shape is a contract
// several screens hold, and "what is this person paying and until when" is a
// different question from "who is this person".
export const memberSubscriptionPrism = {
  fingerprint: subscriptionForMember.fingerprint,
  context: { personId: { $ref: '$.personId' } },
};

export const personPassesPrism = {
  fingerprint: passesForPerson.fingerprint,
  context: { personId: { $ref: '$.personId' } },
};

export const offeringsPrism = { fingerprint: offeringsList.fingerprint, context: {} };

export const startPlanPrism = {
  fingerprint: subscriptionStart.fingerprint,
  context: {
    personId: { $ref: '$.personId' },
    offeringId: { $ref: '$.startOfferingId' },
    paidVia: { $ref: '$.startPaidVia' },
  },
};

export const recordPaymentPrism = {
  fingerprint: subscriptionRecordPayment.fingerprint,
  context: {
    subscriptionId: { $ref: '$.subscription.subscription_id' },
    paidUntil: { $ref: '$.paidUntil' },
  },
};

export const endSubscriptionPrism = {
  fingerprint: subscriptionEnd.fingerprint,
  context: { subscriptionId: { $ref: '$.subscription.subscription_id' } },
};

export const sellPassPrism = {
  fingerprint: passSell.fingerprint,
  context: {
    personId: { $ref: '$.personId' },
    offeringId: { $ref: '$.sellOfferingId' },
    paidVia: { $ref: '$.sellPaidVia' },
  },
};

// The browser sends an id and nothing else. The DATE is stamped by the trigger
// from the studio's own clock — see subscription.entries.ts.
export const giveNoticePrism = {
  fingerprint: subscriptionGiveNotice.fingerprint,
  context: { subscriptionId: { $ref: '$.subscription.subscription_id' } },
};

export const withdrawNoticePrism = {
  fingerprint: subscriptionWithdrawNotice.fingerprint,
  context: { subscriptionId: { $ref: '$.subscription.subscription_id' } },
};

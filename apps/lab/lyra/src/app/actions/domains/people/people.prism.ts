import { coursesList, enrolMember, enrolmentsForMember, withdrawMember } from '@lyra/app/vex/course.entries';
import { personById, offeringsList, peopleList, peopleCount, offeringOptions, ROLL_ORDERS } from '@lyra/app/vex/member.entries';
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
// `after`/`afterId`/`order` are the SEEK: the last row already on screen, and
// which ordering that position is in. See the roll's entry for why a cursor
// belongs to one order, and why the orders are declared rather than assumed.
//
// EACH KEY IS A QUESTION, and null is how a prism declines to ask one — it
// assembles a fixed object and cannot drop a key, so vex counts null as absent
// for optional conditions. An empty search box sends no search; a first page
// sends no cursor. Neither sends a sentinel that has to mean "everything".
const SEARCH_OR_NOTHING = {
  $case: {
    branches: [{ when: { $eq: [{ $ref: '$.search' }, ''] }, then: null }],
    else: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
  },
};

const CURSOR_OR_NOTHING = (ref: string) => ({
  $case: { branches: [{ when: { $eq: [{ $ref: ref }, ''] }, then: null }], else: { $ref: ref } },
});


export const peopleListPrism = {
  fingerprint: peopleList.fingerprint,
  context: {
    lens: { $ref: '$.scope' },
    q: SEARCH_OR_NOTHING,
    afterId: CURSOR_OR_NOTHING('$.afterId'),
    // ONE CURSOR KEY PER ORDER, and only the live one carries a value.
    //
    // The screen holds a single `after` — the last row's value on whatever
    // column it is sorted by — and this routes it to the key belonging to the
    // order actually in force. Every other order's key goes null, so its arm
    // drops out and binds nothing: that is what keeps a name out of a date
    // comparison, which is a 500 rather than a wrong answer.
    //
    // Generated from ROLL_ORDERS, so a new sortable column is one entry there
    // and nothing here.
    ...Object.fromEntries(
      ROLL_ORDERS.map((o) => [
        o.cursor,
        {
          $case: {
            branches: [{
              when: { $eq: [{ $join: { parts: [{ $ref: '$.sortBy' }, '-', { $ref: '$.sortDir' }], sep: '' } }, `${o.field}-${o.dir}`] },
              then: CURSOR_OR_NOTHING('$.after'),
            }],
            else: null,
          },
        },
      ]),
    ),
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

export const peopleCountPrism = {
  fingerprint: peopleCount.fingerprint,
  context: {
    lens: { $ref: '$.scope' },
    q: SEARCH_OR_NOTHING,
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

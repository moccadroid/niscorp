import { coursesList, enrolMember, enrolmentsForMember, withdrawMember } from '@lyra/app/vex/course.entries';
import { personById, familyForPerson, offeringsList, peopleList, peopleCount, offeringOptions, ROLL_ORDERS } from '@lyra/app/vex/member.entries';
import { personAnchorUpdate } from '@lyra/app/vex/member.mutations';
import { childCreate, childAttach, peopleEnroll } from '@lyra/app/vex/intake.entries';
import {
  subscriptionForMember,
  subscriptionGiveNotice,
  subscriptionWithdrawNotice,
  subscriptionStart,
  subscriptionRecordPayment,
  subscriptionEnd,
  passSell,
  passesForPerson,
  purchasesForPerson,
} from '@lyra/app/vex/subscription.entries';

// Null declines a condition: a prism assembles a fixed object and cannot drop a
// key, and vex counts null as absent for an optional condition.
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
    holding: { $ref: '$.holding' },
    q: SEARCH_OR_NOTHING,
    afterId: CURSOR_OR_NOTHING('$.afterId'),
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
    holding: { $ref: '$.holding' },
    q: SEARCH_OR_NOTHING,
  },
};

export const planOptionsPrism = { fingerprint: offeringOptions.fingerprint, context: { kind: 'recurring' } };
export const passOptionsPrism = { fingerprint: offeringOptions.fingerprint, context: { kind: 'pass' } };

export const personByIdPrism = {
  fingerprint: personById.fingerprint,
  context: { personId: { $ref: '$.personId' } },
};

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

// Not read off the write's own answer: `people/enroll` is a mutation array, and
// what an endpoint target holds after one is not a row shape a prism can walk.
export const findSignedUpPrism = {
  fingerprint: peopleList.fingerprint,
  context: {
    q: { $join: { parts: ['%', { $ref: '$.signedUpEmail' }, '%'], sep: '' } },
    lens: 'everyone',
    holding: 'any',
    sortBy: 'people.name',
    sortDir: 'asc',
  },
};

export const startAtSignupPrism = {
  fingerprint: subscriptionStart.fingerprint,
  context: {
    personId: { $ref: '$.signedUpRows[0].person_id' },
    offeringId: { $ref: '$.signupOfferingId' },
    paidVia: { $ref: '$.signupPaidVia' },
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

export const memberSubscriptionPrism = {
  fingerprint: subscriptionForMember.fingerprint,
  context: { personId: { $ref: '$.personId' } },
};

export const personPassesPrism = {
  fingerprint: passesForPerson.fingerprint,
  context: { personId: { $ref: '$.personId' } },
};

export const personFamilyPrism = {
  fingerprint: familyForPerson.fingerprint,
  context: { personId: { $ref: '$.personId' } },
};

export const createChildPrism = {
  fingerprint: childCreate.fingerprint,
  context: {
    name: { $trim: { $ref: '$.childName' } },
    bornOn: { $case: { branches: [{ when: { $eq: [{ $ref: '$.childBornOn' }, ''] }, then: null }], else: { $ref: '$.childBornOn' } } },
  },
};

export const attachChildPrism = {
  fingerprint: childAttach.fingerprint,
  context: {
    childPersonId: { $ref: '$.newChild.id' },
    guardianPersonId: { $ref: '$.personId' },
    source: 'referral',
    notes: '',
  },
};

export const personPurchasesPrism = {
  fingerprint: purchasesForPerson.fingerprint,
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
    // The reference names an outside payment, so a redelivered one cannot sell a
    // second pass. Null from a desk, not empty: nulls do not collide, so two
    // hand-sold passes are two passes.
    purchaseRef: null,
  },
};

export const giveNoticePrism = {
  fingerprint: subscriptionGiveNotice.fingerprint,
  context: { subscriptionId: { $ref: '$.subscription.subscription_id' } },
};

export const withdrawNoticePrism = {
  fingerprint: subscriptionWithdrawNotice.fingerprint,
  context: { subscriptionId: { $ref: '$.subscription.subscription_id' } },
};

import { bookClass, bookForFamily, cancelFamilyBooking, cancelMyBooking, familyBookings, myBookedSessions, myBookings, myCard, myPasses } from '@lyra/app/vex/me.entries';
import { myMembership } from '@lyra/app/vex/subscription.entries';
import { sessionsUpcoming } from '@lyra/app/vex/schedule.entries';
import { coursesList } from '@lyra/app/vex/course.entries';
import { joinCourse, leaveCourse, myEnrolments } from '@lyra/app/vex/course.entries';

export const myCardPrism = { fingerprint: myCard.fingerprint, context: {} };
export const myMembershipPrism = { fingerprint: myMembership.fingerprint, context: {} };
export const myPassesPrism = { fingerprint: myPasses.fingerprint, context: {} };
export const myBookingsPrism = { fingerprint: myBookings.fingerprint, context: {} };

export const familyBookingsPrism = { fingerprint: familyBookings.fingerprint, context: {} };

export const bookForPrism = {
  fingerprint: bookForFamily.fingerprint,
  context: { sessionId: { $ref: '$.sessionId' }, subjectId: { $ref: '$.subjectId' } },
};
export const cancelForPrism = {
  fingerprint: cancelFamilyBooking.fingerprint,
  context: { bookingId: { $ref: '$.bookingId' } },
};

// At the member's reach the engine stamps person_id from the caller, so the
// `personId` of the start is overridden. `manual` because no payment processor
// is in this path: the desk settles the money side.
export const plansOnSalePrism = { fingerprint: 'offerings/on-sale', context: {} };
export const choosePlanPrism = {
  fingerprint: 'subscriptions/start',
  context: { personId: '', offeringId: { $ref: '$.chosenOfferingId' }, paidVia: 'manual' },
};

export const myGiveNoticePrism = {
  fingerprint: 'subscriptions/give-notice',
  context: { subscriptionId: { $ref: '$.membership.subscription_id' } },
};
export const myPausePrism = {
  fingerprint: 'subscriptions/pause',
  context: { subscriptionId: { $ref: '$.membership.subscription_id' } },
};
export const myResumePrism = {
  fingerprint: 'subscriptions/resume',
  context: { subscriptionId: { $ref: '$.membership.subscription_id' } },
};

export const upcomingPrism = {
  fingerprint: sessionsUpcoming.fingerprint,
  context: {},
};

export const myBookedSessionsPrism = { fingerprint: myBookedSessions.fingerprint, context: {} };

export const bookPrism = { fingerprint: bookClass.fingerprint, context: { sessionId: { $ref: '$.sessionId' } } };
export const cancelPrism = { fingerprint: cancelMyBooking.fingerprint, context: { bookingId: { $ref: '$.bookingId' } } };

export const coursesPrism = { fingerprint: coursesList.fingerprint, context: {} };
export const myEnrolmentsPrism = { fingerprint: myEnrolments.fingerprint, context: {} };
export const joinPrism = { fingerprint: joinCourse.fingerprint, context: { courseId: { $ref: '$.courseId' } } };
export const leavePrism = { fingerprint: leaveCourse.fingerprint, context: { enrolmentId: { $ref: '$.enrolmentId' } } };

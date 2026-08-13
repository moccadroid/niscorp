import { bookClass, cancelMyBooking, myBookings, myCard, myPasses } from '@lyra/app/vex/me.entries';
import { myMembership } from '@lyra/app/vex/subscription.entries';
import { sessionsUpcoming } from '@lyra/app/vex/schedule.entries';
import { coursesList } from '@lyra/app/vex/course.entries';
import { joinCourse, leaveCourse, myEnrolments } from '@lyra/app/vex/course.entries';

export const myCardPrism = { fingerprint: myCard.fingerprint, context: {} };
// The subscription and the credits are their own reads — a card that joined
// them would vanish for the prospect, who is exactly who this surface must catch.
export const myMembershipPrism = { fingerprint: myMembership.fingerprint, context: {} };
export const myPassesPrism = { fingerprint: myPasses.fingerprint, context: {} };
export const myBookingsPrism = { fingerprint: myBookings.fingerprint, context: {} };

// The plans a member may start themselves, and the start itself. The SAME
// fingerprint the desk replays — at the member's reach the engine stamps
// person_id from the caller, so `personId` here is decoration the scope
// overrides, and "start somebody else" cannot be phrased. `manual` because
// no payment processor is in this path: the desk settles the money side,
// which is most studios' whole reality.
export const plansOnSalePrism = { fingerprint: 'offerings/on-sale', context: {} };
export const choosePlanPrism = {
  fingerprint: 'subscriptions/start',
  context: { personId: '', offeringId: { $ref: '$.chosenOfferingId' }, paidVia: 'manual' },
};

// Leaving and freezing, from their own screen. The same fingerprints the desk
// replays — at the member's reach the ledgers pin person_id to the caller and
// the database verifies it owns the subscription, so "somebody else's" is a
// refusal in the trigger, not a hope in a screen.
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

export const bookPrism = { fingerprint: bookClass.fingerprint, context: { sessionId: { $ref: '$.sessionId' } } };
export const cancelPrism = { fingerprint: cancelMyBooking.fingerprint, context: { bookingId: { $ref: '$.bookingId' } } };

// Courses a member can see and join. The list is what the studio advertises —
// same read the manager screen uses, because there is nothing private on it.
export const coursesPrism = { fingerprint: coursesList.fingerprint, context: {} };
export const myEnrolmentsPrism = { fingerprint: myEnrolments.fingerprint, context: {} };
export const joinPrism = { fingerprint: joinCourse.fingerprint, context: { courseId: { $ref: '$.courseId' } } };
export const leavePrism = { fingerprint: leaveCourse.fingerprint, context: { enrolmentId: { $ref: '$.enrolmentId' } } };

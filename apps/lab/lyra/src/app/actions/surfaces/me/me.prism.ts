import { bookClass, bookForFamily, cancelFamilyBooking, cancelMyBooking, familyBookings, myBookedSessions, myBookings, myCard, myPasses } from '@lyra/app/vex/me.entries';
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

// ── the family ───────────────────────────────────────────────
//
// Who this member may act for, and the week for all of them at once. The
// second is what the household reach bought: one read, whatever the family's
// size, rather than a session per child.
export const familyBookingsPrism = { fingerprint: familyBookings.fingerprint, context: {} };

// BOOKING FOR A CHILD. `subjectId` names WHO, and it is the one value on this
// surface that is not the caller — which is exactly why it is not trusted:
// the entry resolves it through a `$lookup` on `guardianships` whose read
// rules the engine supplies, so a subject this member does not guard becomes
// NULL and the write dies. See me.entries.ts.
export const bookForPrism = {
  fingerprint: bookForFamily.fingerprint,
  context: { sessionId: { $ref: '$.sessionId' }, subjectId: { $ref: '$.subjectId' } },
};
export const cancelForPrism = {
  fingerprint: cancelFamilyBooking.fingerprint,
  context: { bookingId: { $ref: '$.bookingId' } },
};

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

// What they already hold, so the class list can say so — the read written for
// exactly this two reviews ago, called for the first time here.
export const myBookedSessionsPrism = { fingerprint: myBookedSessions.fingerprint, context: {} };

export const bookPrism = { fingerprint: bookClass.fingerprint, context: { sessionId: { $ref: '$.sessionId' } } };
export const cancelPrism = { fingerprint: cancelMyBooking.fingerprint, context: { bookingId: { $ref: '$.bookingId' } } };

// Courses a member can see and join. The list is what the studio advertises —
// same read the manager screen uses, because there is nothing private on it.
export const coursesPrism = { fingerprint: coursesList.fingerprint, context: {} };
export const myEnrolmentsPrism = { fingerprint: myEnrolments.fingerprint, context: {} };
export const joinPrism = { fingerprint: joinCourse.fingerprint, context: { courseId: { $ref: '$.courseId' } } };
export const leavePrism = { fingerprint: leaveCourse.fingerprint, context: { enrolmentId: { $ref: '$.enrolmentId' } } };

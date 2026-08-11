import { bookClass, cancelMyBooking, myBookings, myCard } from '@lyra/app/vex/me.entries';
import { sessionsUpcoming } from '@lyra/app/vex/schedule.entries';
import { coursesList } from '@lyra/app/vex/course.entries';
import { joinCourse, leaveCourse, myEnrolments } from '@lyra/app/vex/course.entries';

// Note how short these are.
//
// `me/card` and `me/bookings` take no context at all — the engine already
// knows whose they are, so there is no id to pass and therefore none to forge.
// `me/book` takes one value, and `me/cancel` takes a booking id that the
// behaviors will refuse unless it already carries this caller's person id.
export const myCardPrism = { fingerprint: myCard.fingerprint, context: {} };
export const myBookingsPrism = { fingerprint: myBookings.fingerprint, context: {} };

// The same read the staff timetable uses. A member may replay it because they
// hold `class_sessions.read` and `programs.read` and it touches nothing else —
// a timetable is what a studio advertises, not what it keeps private.
// The window is computed from the ambient `$.today` moss folds in per request,
// exactly as the staff timetable computes it — so a member cannot widen it by
// sending a different date, because they do not send one.
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

import { coursesList, enrolMember, enrolmentsForMember, withdrawMember } from '@lyra/app/vex/course.entries';
import { memberById, membersList, membersMatching } from '@lyra/app/vex/member.entries';
import { memberEnd, memberReactivate, memberUpdate } from '@lyra/app/vex/member.mutations';

// Endpoint bodies for the roll. A vex call is `{ fingerprint, context }` and
// the context carries only what the action's own data holds — `$ref` pulls
// from the action, never from a component and never from the URL.
//
// One list endpoint, parameterised: which statuses the list is showing is
// action data, so switching slices and re-reading after a save are the same
// call. Nothing here has to remember which of two reads was current.
// THE WILDCARDS ARE ADDED HERE, and that is not an arbitrary choice of file.
//
// The first attempt built the pattern in the TRIGGER, with a `set` carrying a
// `$join` — which silently does nothing: a trigger's `set` resolves bindings and
// never evaluates prism ops. The search box typed, the read ran, and the filter
// received the literal string every time. This codebase has that limitation
// written into a comment elsewhere, and it still got made here.
//
// A request prism IS evaluated, so this is where a value gets assembled. It also
// means the box holds what somebody typed and nothing else — a member searching
// for their own name should not have to know what a wildcard is.
export const membersListPrism = {
  fingerprint: membersList.fingerprint,
  context: { statuses: { $ref: '$.statuses' }, q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } },
};

// The same context, counting instead of listing — so a capped list can say what
// it is a slice OF. Two reads rather than one because an aggregate and a page of
// rows are different shapes, and vex answers one question per fingerprint.
export const membersCountPrism = {
  fingerprint: membersMatching.fingerprint,
  context: { statuses: { $ref: '$.statuses' }, q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } },
};

export const memberByIdPrism = {
  fingerprint: memberById.fingerprint,
  context: { membershipId: { $ref: '$.membershipId' } },
};

export const memberUpdatePrism = {
  fingerprint: memberUpdate.fingerprint,
  context: {
    membershipId: { $ref: '$.membershipId' },
    status: { $ref: '$.status' },
    notes: { $ref: '$.notes' },
  },
};

// The end date is not sent. It is stamped by the engine from the studio's own
// clock (`$scope: 'today'` in the mutation), so a cancellation cannot be dated
// by whichever machine happened to make the request.
export const memberEndPrism = {
  fingerprint: memberEnd.fingerprint,
  context: { membershipId: { $ref: '$.membershipId' } },
};

export const memberReactivatePrism = {
  fingerprint: memberReactivate.fingerprint,
  context: { membershipId: { $ref: '$.membershipId' } },
};

// The desk enrolling somebody. `membershipId` is the record already on screen;
// `person_id` is derived by the database from it, and `studio_id` is stamped by
// the engine — so nothing in this write names a human, and a request cannot
// pair one member's membership with another's person.
export const openCoursesPrism = { fingerprint: coursesList.fingerprint, context: {} };
export const memberEnrolmentsPrism = { fingerprint: enrolmentsForMember.fingerprint, context: { membershipId: { $ref: '$.membershipId' } } };
export const enrolPrism = { fingerprint: enrolMember.fingerprint, context: { courseId: { $ref: '$.courseId' }, membershipId: { $ref: '$.membershipId' } } };
export const withdrawPrism = { fingerprint: withdrawMember.fingerprint, context: { enrolmentId: { $ref: '$.enrolmentId' } } };

import type { MutationEntry } from './index';

// Writes on the roll. Every one is an authored mutation replayed by
// fingerprint — the statement lives server-side and the wire carries only
// `{ fingerprint, context }`.
//
// Note what is absent from every one of these: `studio_id`. The engine stamps
// it from the caller's scope on write and matches it on update, so a form
// cannot place a row into another studio and cannot reach one either. That is
// why no layout in this application has ever seen a studio id.

// What the desk changes about a membership: where it is in its lifecycle, and
// what somebody wrote down. Both in one statement because they are one gesture
// on one form — two fingerprints would let a save half-apply.
export const memberUpdate: MutationEntry = {
  fingerprint: 'members/update',
  intent: "Set a membership's status and notes",
  mutation: {
    op: 'update',
    table: 'memberships',
    set: { status: { $context: 'status' }, notes: { $context: 'notes' } },
    where: { eq: ['memberships.id', { $context: 'membershipId' }] },
  },
};

// Ending a membership is a status change plus a date, not a delete. A studio
// that deletes the row loses the answer to "how many people left this year",
// which is the figure that tells them whether anything is wrong.
export const memberEnd: MutationEntry = {
  fingerprint: 'members/end',
  intent: 'Mark a membership cancelled as of a date',
  mutation: {
    op: 'update',
    table: 'memberships',
    // ENDED_ON IS NOT SET HERE.
    //
    // The mutation grammar takes `$context` only, so a caller-supplied date is
    // the only shape it can express — and a cancellation dated by whichever
    // machine made the request is permanently wrong for a studio across a UTC
    // boundary. A write's mistakes do not wash out on the next read.
    //
    // So the DATABASE stamps it, which is where every other derived fact in
    // this schema already lives: a trigger writes `ended_on` from the studio's
    // own clock the moment a membership becomes cancelled. The write names the
    // intent; the database records when it happened.
    set: { status: 'cancelled' },
    where: { eq: ['memberships.id', { $context: 'membershipId' }] },
  },
};

// Bringing somebody back. Separate from `update` because it clears a column
// that form does not carry, and a save that silently un-cancelled a membership
// would be a surprise.
export const memberReactivate: MutationEntry = {
  fingerprint: 'members/reactivate',
  intent: 'Return a membership to active and clear its end date',
  mutation: {
    op: 'update',
    table: 'memberships',
    set: { status: 'active', ended_on: null },
    where: { eq: ['memberships.id', { $context: 'membershipId' }] },
  },
};

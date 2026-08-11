import type { CacheEntry, MutationEntry } from './index';
import { dateText, priceText } from '@lyra/app/prisms/format.prism';

// WHAT A MEMBER MAY ASK FOR.
//
// Every entry here reads a table pinned to the caller by `personal` behaviors,
// so there is nothing to parameterise: "my card" takes no id, because the only
// card the engine will return is theirs. That is the tell that this is right —
// a read that cannot be pointed at somebody else has no argument for who.
//
// Note what is NOT here: no `memberships/*`, no `people/*`, no `bookings/*`.
// A member holds the verbs for their own tables and no others, so those
// fingerprints are unreplayable for them at the surface, not merely absent
// from their screen.

const row = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name] } });
const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'c' }, path: [name], fallback } });

const STATUS_LABEL = {
  $case: {
    branches: [
      { when: { $eq: [one('status'), 'active'] }, then: 'Active' },
      { when: { $eq: [one('status'), 'trialling'] }, then: 'Trial' },
      { when: { $eq: [one('status'), 'paused'] }, then: 'Paused' },
      { when: { $eq: [one('status'), 'lapsed'] }, then: 'Lapsed' },
    ],
    else: 'Ended',
  },
};

// Their membership, as they see it. One row by construction: the behaviors
// return only rows carrying this caller's person id at this caller's studio,
// and a person has at most one membership per studio by unique constraint.
export const myCard: CacheEntry = {
  fingerprint: 'me/card',
  intent: 'The membership card of whoever is asking',
  // SERVED AT PERSONAL REACH WHOEVER ASKS.
  //
  // "Their card" is a property of the READ, not of the reader. Without this the
  // reach would be the caller's, and a caller holding two roles gets the widest
  // either grants — so an instructor who also trains would be handed whichever
  // membership the planner reached first. See `OkCacheEntry.reach`.
  reach: 'personal',
  shape: { studio_name: '', status: '', status_label: '', status_tone: '', plan_name: '', price_display: '', allowance_display: '', joined_display: '' },
  // A join over the tables that own the facts — `memberships` for the standing,
  // `studios` for the name, `subscriptions × plans` for the money.
  //
  // This was a projection table for one turn, on the belief that granting these
  // three to the member rung handed them to every staff rung above, because
  // `member` was the base of the ladder and staff have no personal reach. The
  // fix for that was never a fourth table: `member` is a RELATIONSHIP, not the
  // bottom rung, so it sits beside the staff roles rather than under them and
  // the grants stop travelling. What a member reads here is one row — theirs —
  // by the `personal` profile below.
  dsl: {
    from: ['memberships', 'studios', 'subscriptions', 'plans'],
    // ALIASED, because two of these are called `name`. Unaliased, the studio and
    // the plan land on the same key and the last one written wins — which reads
    // as a card titled after the plan.
    fields: [
      { field: 'studios.name', as: 'studio_name' },
      'memberships.status',
      { field: 'plans.name', as: 'plan_name' },
      'plans.price_cents',
      'plans.class_allowance',
      'memberships.joined_on',
    ],
    limit: 1,
  },
  mapping: {
    $with: {
      // `$.result` IS the row here, not a list holding it.
      //
      // A `shape` declared as an object rather than an array makes vex unwrap
      // the single row, so indexing `[0]` finds nothing and every field falls
      // back — which renders as a plausible, entirely empty card rather than
      // as an error. The list entries below map over `$.result` because their
      // shapes are arrays. The shape is what decides it.
      let: { c: { $ref: '$.result' } },
      value: {
        studio_name: one('studio_name'),
        status: one('status'),
        status_label: STATUS_LABEL,
        status_tone: {
          $case: {
            branches: [
              { when: { $eq: [one('status'), 'active'] }, then: 'good' },
              { when: { $eq: [one('status'), 'trialling'] }, then: 'warm' },
              { when: { $eq: [one('status'), 'paused'] }, then: 'calm' },
            ],
            else: 'alert',
          },
        },
        // A member with no subscription is on no plan, which is a real state
        // and not an error — a trial is exactly that.
        plan_name: { $case: { branches: [{ when: one('plan_name', null), then: one('plan_name') }], else: 'No plan yet' } },
        price_display: { $case: { branches: [{ when: one('price_cents', null), then: priceText(one('price_cents')) }], else: '' } },
        allowance_display: { $case: { branches: [{ when: one('class_allowance', null), then: { $join: { parts: [one('class_allowance'), ' classes a month'], sep: '' } } }], else: 'Unlimited classes' } },
        joined_display: dateText(one('joined_on', null)),
      },
    },
  },
};

// What they have booked. Everything on the row is denormalised by the mirror
// trigger, so this is a single-table read with no joins to get wrong.
export const myBookings: CacheEntry = {
  fingerprint: 'me/bookings',
  // "What YOU have booked" — personal whoever asks. Unpinned, this listed all
  // 93 bookings at the studio to a teacher who also trains there.
  reach: 'personal',
  intent: 'The classes the person asking has booked',
  shape: [{ booking_id: '', session_id: '', class_name: '', program_name: '', tone: '', status: '', when_display: '', held_on: '', state_label: '', state_tone: '' }],
  // THE REAL TABLE, filtered by the rung's reach.
  //
  // This read `member_bookings` — a table that existed for one reason: a
  // behavior was a property of the TABLE, so granting a member `bookings.read`
  // gave them the same reach the desk has, which is every booking at the
  // studio. A second table with a person-filtered rule was the only way to say
  // "their own".
  //
  // One fact in two places, kept level by a trigger — and the trigger was
  // missing in one direction, so a member with twenty-six bookings was shown
  // "Nothing booked yet" while the desk saw every one of them.
  //
  // Reach is a property of the RUNG now. The member rung says
  // `scoping: 'personal'`; `bookings` declares what that means; and the desk
  // replaying this identical fingerprint gets the whole studio. The join back
  // to sessions and programs is what the projection's denormalised columns were
  // avoiding — three tables a member already reads, on indexed keys.
  dsl: {
    from: ['bookings', 'class_sessions', 'programs'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      'bookings.session_id',
      'bookings.status',
      { field: 'class_sessions.name', as: 'class_name' },
      { field: 'class_sessions.held_on', as: 'held_on' },
      { field: 'class_sessions.starts_at', as: 'starts_at' },
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'tone' },
    ],
    // Waitlisted rows belong here too: a member waiting for a class needs to
    // see that they are waiting, and needs the control to stop.
    // FROM TODAY FORWARD. Without the date bound this listed every class the
    // member had ever booked, oldest first — so 'Coming up' opened on June and
    // offered a Cancel button against a class already attended.
    filter: { and: [{ gte: ['class_sessions.held_on', { $scope: 'today' }] }, { neq: ['bookings.status', 'cancelled'] }] },
    sort: [{ field: 'class_sessions.held_on', dir: 'asc' }, { field: 'class_sessions.starts_at', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        booking_id: row('booking_id'),
        session_id: row('session_id'),
        class_name: row('class_name'),
        program_name: row('program_name'),
        tone: row('tone'),
        status: row('status'),
        held_on: row('held_on'),
        when_display: dateText(row('held_on')),
        // Said in words, because "waitlisted" is the one status a member has to
        // understand without being told what the app means by it.
        state_label: { $case: { branches: [{ when: { $eq: [row('status'), 'waitlisted'] }, then: 'Waiting' }], else: 'Booked' } },
        state_tone: { $case: { branches: [{ when: { $eq: [row('status'), 'waitlisted'] }, then: 'warm' }], else: 'good' } },
      },
    },
  },
};

// The session ids they already hold, so the class list can mark them without a
// join the member's policy would not permit anyway.

export const myBookedSessions: CacheEntry = {
  fingerprint: 'me/booked-sessions',
  // Personal whoever asks — unpinned, every class at the studio came back
  // marked as one they had already booked.
  reach: 'personal',
  intent: 'Which class sessions the person asking is already booked into',
  shape: [{ session_id: '' }],
  dsl: {
    from: ['bookings'],
    fields: ['bookings.session_id'],
    filter: { eq: ['bookings.status', 'booked'] },
  },
};

// ─── the two writes ──────────────────────────────────────────

// ONE client value: the session. `membership_id` and `studio_id` are stamped by
// the engine from scope, and the trigger derives the membership, the class
// name and the time from those. There is no field here a crafted request could
// aim somewhere else.
export const bookClass: MutationEntry = {
  fingerprint: 'me/book',
  intent: 'Book myself into a class',
  // PERSONAL WHOEVER ASKS — and a write cares about this more than a read.
  // Too wide on a read shows somebody too much; too wide here BOOKS a class
  // against a membership that is not theirs. Nothing today grants a second role `bookings.write`, so
  // this is closing the door before somebody walks through it.
  reach: 'personal',

  // ONE VALUE. `membership_id` and `studio_id` are stamped from the rung's
  // reach, so "book somebody else in" is not a request that can be phrased —
  // the same property the parallel table gave, from the grant instead.
  mutation: {
    op: 'insert',
    table: 'bookings',
    values: { session_id: { $context: 'sessionId' } },
  },
};

// Cancelling is an update, never a delete: the seat has to be freed on the
// operational row, and a studio asking "who cancels every week" needs the row
// to still be there to answer.
export const cancelMyBooking: MutationEntry = {
  fingerprint: 'me/cancel',
  intent: 'Cancel a class I booked',
  // PERSONAL WHOEVER ASKS — and a write cares about this more than a read.
  // Too wide on a read shows somebody too much; too wide here CANCELS a class
  // that is not theirs. Nothing today grants a second role `bookings.write`, so
  // this is closing the door before somebody walks through it.
  reach: 'personal',

  // The row filter rides on the UPDATE too, so naming somebody else's booking
  // id matches nothing rather than cancelling their class.
  mutation: {
    op: 'update',
    table: 'bookings',
    set: { status: 'cancelled' },
    where: { eq: ['bookings.id', { $context: 'bookingId' }] },
  },
};

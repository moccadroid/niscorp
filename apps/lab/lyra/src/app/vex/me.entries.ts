import type { CacheEntry, MutationEntry } from './index';
import { dateText, timeText } from '@lyra/app/prisms/format.prism';
import { STANDING, standingLabel, standingTone } from './standing';

const row = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name] } });
const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'c' }, path: [name], fallback } });

export const myCard: CacheEntry = {
  fingerprint: 'me/card',
  intent: 'The standing of whoever is asking, at their own studio',
  // `reach` is a property of the READ. Without it a caller holding two roles
  // gets the widest either grants, and a teacher who trains here is handed
  // whichever person the planner reached first.
  reach: 'personal',
  // The anchor and the standing ONLY. What they hold — the subscription, the
  // passes — are their own reads (`me/membership`, `me/passes`): a reverse
  // join is INNER, so a card that joined subscriptions would simply vanish
  // for the prospect at the plan-choice cliff, who is exactly the person the
  // member surface has to catch.
  shape: { studio_name: '', standing: '', status_label: '', status_tone: '', joined_display: '', trial_display: '', on_trial: false },
  dsl: {
    from: ['studio_people', 'studios'],
    fields: [
      { field: 'studios.name', as: 'studio_name' },
      'studio_people.first_seen_on',
      'studio_people.trial_ends_on',
    ],
    compute: STANDING,
    limit: 1,
  },
  // An object `shape` makes vex unwrap the single row, so `$.result` IS the row.
  mapping: {
    $with: {
      let: { c: { $ref: '$.result' } },
      value: {
        studio_name: one('studio_name'),
        standing: one('standing'),
        status_label: standingLabel(one('standing')),
        status_tone: standingTone(one('standing')),
        joined_display: dateText(one('first_seen_on', null)),
        trial_display: dateText(one('trial_ends_on', null)),
        on_trial: { $case: { branches: [{ when: { $eq: [one('standing'), 'trialling'] }, then: true }], else: false } },
      },
    },
  },
};

// What they hold in credits, personal-pinned like everything on this surface.
export const myPasses: CacheEntry = {
  fingerprint: 'me/passes',
  intent: 'The class passes of whoever is asking',
  reach: 'personal',
  shape: [{ pass_id: '', name: '', credits_display: '', state_label: '', expires_display: '' }],
  dsl: {
    from: ['passes', 'offerings'],
    fields: [
      { field: 'passes.id', as: 'pass_id' },
      'passes.credits_total',
      'passes.credits_used',
      'passes.status',
      'passes.expires_on',
      { field: 'offerings.name', as: 'name' },
    ],
    sort: [{ field: 'passes.purchased_on', dir: 'desc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        pass_id: row('pass_id'),
        name: row('name'),
        credits_display: {
          $join: { parts: [{ $sub: [row('credits_total'), row('credits_used')] }, ' of ', row('credits_total'), ' left'], sep: '' },
        },
        state_label: { $case: { branches: [{ when: { $eq: [row('status'), 'used_up'] }, then: 'Used up' }], else: 'Active' } },
        expires_display: dateText({ $get: { from: { $var: 'r' }, path: ['expires_on'], fallback: { $const: null } } }),
      },
    },
  },
};

export const myBookings: CacheEntry = {
  fingerprint: 'me/bookings',
  // "What YOU have booked" — personal whoever asks. Unpinned, this lists every
  // booking at the studio to a teacher who also trains there.
  reach: 'personal',
  intent: 'The classes the person asking has booked',
  shape: [{ booking_id: '', session_id: '', class_name: '', program_name: '', tone: '', status: '', when_display: '', held_on: '', state_label: '', state_tone: '', session_cancelled: false }],
  dsl: {
    from: ['bookings', 'class_sessions', 'programs'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      'bookings.session_id',
      'bookings.status',
      { field: 'class_sessions.name', as: 'class_name' },
      { field: 'class_sessions.held_on', as: 'held_on' },
      { field: 'class_sessions.starts_at', as: 'starts_at' },
      // The SESSION's own status, not just the booking's. A studio cancelling
      // a class does not touch anybody's booking row — the one screen that
      // tells a member where to turn up has to look at both.
      { field: 'class_sessions.status', as: 'session_status' },
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'tone' },
    ],
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
        // Day AND time — this list's whole job is saying when to turn up.
        // Joined with punctuation, not words: each half is already made by a
        // locale-aware op, and a separator with no language needs no book.
        when_display: { $join: { parts: [dateText(row('held_on')), timeText(row('starts_at'))], sep: ' · ' } },
        // What the layout branches on: the Cancel verb disappears when the
        // studio already cancelled the class — there is nothing left to cancel.
        session_cancelled: { $eq: [row('session_status'), 'cancelled'] },
        // In words: the two states a member has to understand without being
        // told what the app means by them. The SESSION being off outranks
        // whatever the booking says — "Booked" on a cancelled class is a
        // member turning up to a locked door.
        state_label: {
          $case: {
            branches: [
              { when: { $eq: [row('session_status'), 'cancelled'] }, then: 'Cancelled' },
              { when: { $eq: [row('status'), 'waitlisted'] }, then: 'Waiting' },
            ],
            else: 'Booked',
          },
        },
        state_tone: {
          $case: {
            branches: [
              { when: { $eq: [row('session_status'), 'cancelled'] }, then: 'warn' },
              { when: { $eq: [row('status'), 'waitlisted'] }, then: 'warm' },
            ],
            else: 'good',
          },
        },
      },
    },
  },
};

// So the class list can mark what they already hold, without a join their policy
// would not permit anyway.
export const myBookedSessions: CacheEntry = {
  fingerprint: 'me/booked-sessions',
  // Unpinned, every class at the studio comes back marked as already booked.
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

export const bookClass: MutationEntry = {
  fingerprint: 'me/book',
  intent: 'Book myself into a class',
  reach: 'personal',

  mutation: {
    op: 'insert',
    table: 'bookings',
    values: { session_id: { $context: 'sessionId' } },
  },
};

// An update, never a delete: the seat has to be freed on the operational row,
// and "who cancels every week" needs the row to still be there to answer.
export const cancelMyBooking: MutationEntry = {
  fingerprint: 'me/cancel',
  intent: 'Cancel a class I booked',
  reach: 'personal',

  // The row filter rides on the UPDATE too, so naming somebody else's booking id
  // matches nothing rather than cancelling their class.
  mutation: {
    op: 'update',
    table: 'bookings',
    set: { status: 'cancelled' },
    where: { eq: ['bookings.id', { $context: 'bookingId' }] },
  },
};

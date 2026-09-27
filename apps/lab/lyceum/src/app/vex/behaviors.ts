import type { ScopeBehaviors } from '@niscorp/vex';

// Row-level rules the charter cannot say (AGENTS.md, rule 10).
//
// `default` — what every role's reads and writes do on `members`: a member row
// is inserted by the person it belongs to, and the engine stamps its id from
// their session's `userId`. A request cannot name somebody else's id.
//
// `personal` — the reach of the Forms role (charter.ts, `scoping`): an update
// only ever reaches the caller's own row. Forms can change their record; the
// grant says they may update members, this says which member — for every
// entry they replay, not only the one written for them. `members/rename` also
// asks for it, so a rename stays personal whoever holds the verb.
export const BEHAVIORS: ScopeBehaviors = {
  members: {
    default: { insert: [{ set: 'member_id', to: 'userId' }] },
    personal: {
      insert: [{ set: 'member_id', to: 'userId' }],
      update: [{ match: 'member_id', to: 'userId' }],
    },
  },
  // A question is recorded as the person who asked it: the engine stamps
  // `member_id`, and a request cannot put a question in anybody else's name.
  asks: {
    default: { insert: [{ set: 'member_id', to: 'userId' }] },
  },
  // A timer is saved by whoever saved it (the speaker): stamped, not sent.
  timers: {
    default: { insert: [{ set: 'saved_by', to: 'userId' }] },
  },
  // A conversation is its person's alone: written as them, read and resolved
  // only by them — the speaker's included.
  assistant_turns: {
    default: {
      read: [{ match: 'member_id', to: 'userId' }],
      insert: [{ set: 'member_id', to: 'userId' }],
      update: [{ match: 'member_id', to: 'userId' }],
    },
  },
};

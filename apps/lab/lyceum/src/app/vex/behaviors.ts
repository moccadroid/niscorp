import type { ScopeBehaviors } from '@niscorp/vex';

// Row-level rules the charter cannot say (AGENTS.md, rule 10).
//
// `default` — what every role's reads and writes do on `members`: a member row
// is inserted by the person it belongs to, and the engine stamps its id from
// their session's `userId`. A request cannot name somebody else's id.
//
// `personal` — the reach an entry can ask for (`members/rename`): an update
// only ever reaches the caller's own row. Forms can change their record; the
// grant says they may update members, this says which member.
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
};

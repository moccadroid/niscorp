import type { ScopeBehaviors } from '@niscorp/vex';

// Row-level rules the charter cannot say (AGENTS.md, rule 10).
//
// A member row is inserted by the person it belongs to — the door has them
// write it as themselves — and the engine stamps its id from their session's
// `userId`. A request cannot name somebody else's id: the column is not the
// request's to set.
export const BEHAVIORS: ScopeBehaviors = {
  members: { insert: [{ set: 'member_id', to: 'userId' }] },
};

import type { ScopeBehaviors, SeedEntry, SeedMutation } from '@niscorp/vex';
import { ANSWER_ENTRIES } from './answers.entries';
import { LINK_ENTRIES } from './links.entries';
import { PEOPLE_ENTRIES } from './people.entries';

export const ENTRIES: readonly (SeedEntry | SeedMutation)[] = [...PEOPLE_ENTRIES, ...LINK_ENTRIES, ...ANSWER_ENTRIES];

// Somebody the owner invites is a member, invited by the owner: `inviteeRole` is a constant on the owner's identity, so
// no write of theirs makes another owner. The owner let in at boot was invited by nobody.
export const BEHAVIORS: ScopeBehaviors = {
  people: {
    default: {},
    inviting: { insert: [{ set: 'invited_by', to: 'userId' }, { set: 'role', to: 'inviteeRole' }] },
  },
  answers: { read: [{ match: 'person', to: 'userId' }], insert: [{ set: 'person', to: 'userId' }] },
};

import type { MutationEntry } from './index';

// The anchor's own facts — the studio's notes and the trial window. What a
// person IS is never written anywhere: standing derives from the entitlements
// they hold, and the writes that grant those live in subscription.entries.ts
// (`subscriptions/start`, `passes/sell`, `subscriptions/end`).
export const personAnchorUpdate: MutationEntry = {
  fingerprint: 'people/update',
  intent: "Change the studio's notes or trial window for a person it knows",
  mutation: {
    op: 'update',
    table: 'studio_people',
    set: { notes: { $context: 'notes' }, trial_ends_on: { $context: 'trialEndsOn' } },
    where: { eq: ['studio_people.person_id', { $context: 'personId' }] },
  },
};

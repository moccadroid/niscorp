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

// ── CONSENT IS ITS OWN ACT ───────────────────────────────────
//
// Not a field on the anchor form's Save, because it is not an edit to a note:
// somebody either said the studio may write to them or they did not, and the
// row that records it is the studio's evidence of having asked. Its own
// fingerprint means the ledger shows a consent change as a consent change.
//
// The desk holds it because the desk is who asks — at the counter, on the way
// in. The member's own side takes it away rather than gives it, and does that
// without a session at all (server/unsubscribe.ts): a one-click opt-out has to
// work from an email, years later, for somebody who has forgotten they ever
// had an account.
export const personConsentSet: MutationEntry = {
  fingerprint: 'people/consent',
  intent: 'Record whether somebody has agreed to hear from this studio beyond what they booked',
  mutation: {
    op: 'update',
    table: 'studio_people',
    set: { marketing_ok: { $context: 'marketingOk' } },
    where: { eq: ['studio_people.person_id', { $context: 'personId' }] },
  },
};

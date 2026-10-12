import type { MutationEntry } from './index';

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

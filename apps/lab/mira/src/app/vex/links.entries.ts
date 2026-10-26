import type { SeedMutation } from '@niscorp/vex';

export const linkIssue: SeedMutation = {
  fingerprint: 'links/issue',
  intent: 'Keep a one-time sign-in link for an email address, until it expires',
  mutation: {
    op: 'insert',
    table: 'links',
    values: { token_hash: { $context: 'tokenHash' }, email: { $context: 'email' }, expires_at: { $context: 'expiresAt' } },
  },
};

// Deleting the row is the redemption: a link that was used, or has expired, deletes nothing and returns nothing.
export const linkRedeem: SeedMutation = {
  fingerprint: 'links/redeem',
  intent: 'Use up a one-time sign-in link that has not expired, naming whose it was',
  mutation: {
    op: 'delete',
    table: 'links',
    where: { and: [{ eq: ['links.token_hash', { $context: 'tokenHash' }] }, { gt: ['links.expires_at', { $context: 'now' }] }] },
  },
};

export const LINK_ENTRIES: readonly SeedMutation[] = [linkIssue, linkRedeem];

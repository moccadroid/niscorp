import type { SeedMutation } from '@niscorp/vex';

// Deleting the row is the redemption: a link that has been used, or has
// expired, deletes nothing and returns nothing.
export const loginRedeem: SeedMutation = {
  fingerprint: 'login/redeem',
  intent: 'Use up a one-time sign-in link that has not expired, naming who it signs in',
  mutation: {
    op: 'delete',
    table: 'login_links',
    where: {
      and: [
        { eq: ['login_links.token_hash', { $context: 'tokenHash' }] },
        { gt: ['login_links.expires_at', { $context: 'now' }] },
      ],
    },
  },
};

export const loginIssue: SeedMutation = {
  fingerprint: 'login/issue',
  intent: 'Store a one-time sign-in link for a principal, until it expires',
  mutation: {
    op: 'insert',
    table: 'login_links',
    values: { token_hash: { $context: 'tokenHash' }, principal: { $context: 'principal' }, expires_at: { $context: 'expiresAt' } },
  },
};

export const lecternGrant: SeedMutation = {
  fingerprint: 'grants/lectern',
  intent: 'Grant a fresh principal the speaker sign-in desk',
  mutation: {
    op: 'insert',
    table: 'grants',
    values: { principal: { $context: 'principal' }, role: 'lectern' },
  },
};

export const LOGIN_ENTRIES: readonly SeedMutation[] = [loginRedeem, loginIssue, lecternGrant];

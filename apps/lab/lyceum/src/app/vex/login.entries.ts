import type { SeedMutation } from '@niscorp/vex';

// ── one-time sign-in links: redeemed once, by whoever has the link ──
//
// Run as the `gatekeeper` machinery role — there is no principal yet, which is
// the whole point of a sign-in. Deleting the row IS the redemption: a link
// that has been used, or has expired, deletes nothing and returns nothing.
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

// Issue one: the server writes the link it is about to mail, as the same
// machinery role. Only the hash is stored; the principal is the server's
// choice (./server/login.ts), never a request's.
export const loginIssue: SeedMutation = {
  fingerprint: 'login/issue',
  intent: 'Store a one-time sign-in link for a principal, until it expires',
  mutation: {
    op: 'insert',
    table: 'login_links',
    values: { token_hash: { $context: 'tokenHash' }, principal: { $context: 'principal' }, expires_at: { $context: 'expiresAt' } },
  },
};

// A device opening /speaker gets a principal of its own for the sign-in desk
// (actions/lectern/) — its own, so nobody else with the page open watches the
// speaker type their address. The role is fixed here, never a request's.
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

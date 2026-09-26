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

export const LOGIN_ENTRIES: readonly SeedMutation[] = [loginRedeem];

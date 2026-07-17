import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { mintToken, userByUsername } from '@relay/server/users';

// Sign-in and sign-out as SERVER fns on moss's function seam. sendLink
// fakes the email; redeem mints the token and GRANTS it (the session
// capability — moss sends it down the socket, the terminals reconnect
// authenticated); signOut REVOKES (every terminal closes SIGNED_OUT). A
// real magic-link flow replaces these BODIES (send an email, verify a
// link nonce); the seam and the action stay.
export const authFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'auth.sendLink': async (data) => {
    const username = String(data['username'] ?? '')
      .trim()
      .toLowerCase();
    if (userByUsername(username) === undefined) throw new Error(`No user "${username}" — try alex, jordan or sam.`);
    return username;
  },
  'auth.redeem': async (data) => {
    const token = mintToken(String(data['username'] ?? ''));
    if (token === null) throw new Error('The magic link expired — request a new one.');
    session.grant(token);
    return true;
  },
  'auth.signOut': async () => {
    session.revoke();
    return true;
  },
});

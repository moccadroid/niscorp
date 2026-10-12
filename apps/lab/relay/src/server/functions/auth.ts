import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { mintToken, userByUsername } from '@relay/server/users';

// A demo sign-in: sendLink sends no email and redeem verifies no link.
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

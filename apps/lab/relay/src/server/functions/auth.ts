import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import { mintToken, userByUsername } from '@relay/server/users';

// A demo sign-in: sendLink sends no email and redeem verifies no link.
export const authFunctions = (session: FunctionSession): FunctionDefinition[] => [
  {
    id: 'auth.sendLink',
    description: 'Sends the sign-in link for a username; this demo answers the username instead. Send { username }.',
    execute: async (data) => {
      const username = String(data['username'] ?? '')
        .trim()
        .toLowerCase();
      if (userByUsername(username) === undefined) throw new Error(`No user "${username}" — try alex, jordan or sam.`);
      return username;
    },
  },
  {
    id: 'auth.redeem',
    description: 'Signs the person in from their link. Send { username }.',
    execute: async (data) => {
      const token = mintToken(String(data['username'] ?? ''));
      if (token === null) throw new Error('The magic link expired — request a new one.');
      session.grant(token);
      return true;
    },
  },
  {
    id: 'auth.signOut',
    description: 'Signs the person out of every session of theirs.',
    execute: async () => {
      session.revoke();
      return true;
    },
  },
];

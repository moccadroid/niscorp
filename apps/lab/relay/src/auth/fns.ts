import type { FunctionHandler } from '@niscorp/nova';
import { mintToken } from './token';
import { signIn, signOut } from './session';
import { userByUsername } from './users';

// ═══════════════════════════════════════════════════════════
// Sign-in as Nova fns — the login action's endpoints and the chrome's
// sign-out. sendLink fakes the email (a real magic-link flow replaces these
// bodies, nothing else); redeem mints + stores the token, session listeners
// fire, and the app rebuilds the shell for the new principal.
// ═══════════════════════════════════════════════════════════

const authSendLink: FunctionHandler = async (data) => {
  const username = String(data['username'] ?? '')
    .trim()
    .toLowerCase();
  const user = userByUsername(username);
  if (user === undefined) throw new Error(`No user "${username}" — try alex, jordan or sam.`);
  return user.username;
};

const authRedeem: FunctionHandler = async (data) => {
  const token = mintToken(String(data['username'] ?? ''));
  if (token === null) throw new Error('The magic link expired — request a new one.');
  signIn(token);
  return true;
};

const authSignOut: FunctionHandler = async () => {
  signOut();
  return true;
};

export const authFunctions: Record<string, FunctionHandler> = {
  'auth.sendLink': authSendLink,
  'auth.redeem': authRedeem,
  'auth.signOut': authSignOut,
};

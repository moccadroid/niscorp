import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { mintToken, personByEmail } from '../users';

// Sign in and sign out, on moss's function seam.
//
// Session lifecycle is a CAPABILITY, not a channel: `grant` hands the token
// down the socket and the terminal reconnects as the new principal, which is
// why signing in produces a different application rather than a different view
// of the same one. `revoke` closes every connection of the session and disposes
// the durable shell.
export const authFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  // Ask for a link. In the lab the link is printed; in production this hands
  // the address to a mail provider and returns exactly the same thing —
  // nothing. Deliberately nothing: an endpoint that answered "no such account"
  // would turn the sign-in form into a membership oracle for anyone who cared
  // to ask it, which is a real leak for a business whose members are its
  // customer list.
  'auth.request': async (data) => {
    const email = String(data['email'] ?? '').trim();
    if (email === '' || !email.includes('@')) throw new Error('That does not look like an email address.');
    const token = mintToken(email);
    if (token !== null) {
      // The lab's mail transport.
      console.log(`\n[lyra] sign-in link for ${email}:\n  http://localhost:5180/?token=${token}\n`);
    }
    return true;
  },

  // Follow the link. The demo picker calls this directly with an address,
  // which is the same gesture — a credential arriving from outside the
  // session and being exchanged for one.
  'auth.enter': async (data) => {
    const email = String(data['email'] ?? '').trim();
    const person = personByEmail(email);
    if (person === undefined) throw new Error(`No account for ${email}.`);
    const token = mintToken(email);
    if (token === null) throw new Error('Could not mint a session.');
    session.grant(token);
    return true;
  },

  'auth.leave': async () => {
    session.revoke();
    return true;
  },
});

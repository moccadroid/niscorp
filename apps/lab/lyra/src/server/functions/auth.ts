import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { mintToken, personByEmail } from '../users';

export const authFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
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

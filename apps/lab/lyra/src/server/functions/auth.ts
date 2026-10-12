import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { principalByEmail } from '../links';
import { mintToken } from '../tokens';
import { mintLink, tooManyLinks } from '../links';
import { sendMail } from '../mail/send';

type Deps = { runAs: import('@niscorp/moss').ExecuteAs; now: () => number; base: () => string };

export const authFunctions = (session: FunctionSession, deps: Deps): Record<string, FunctionHandler> => ({
  // One answer for every address, known or not: the endpoint is public, and a
  // different answer for a known address would make it a membership oracle.
  'auth.request': async (data) => {
    const email = String(data['email'] ?? '').trim().toLowerCase();
    if (email === '' || !email.includes('@')) throw new Error('That does not look like an email address.');

    // Counted before the lookup: a limit that only applied to real accounts
    // would be the same oracle.
    if (tooManyLinks(email, deps.now())) throw new Error('That is a lot of sign-in links. Try again in a few minutes.');

    const principal = await principalByEmail(deps.runAs, email);
    if (principal === null) return true;

    const nonce = await mintLink(deps.runAs, principal, deps.now());
    const link = `${deps.base().replace(/\/$/, '')}/?login=${nonce}`;

    const sent = await sendMail({
      to: email,
      // Platform mail, not a studio's: a sign-in link arriving in a studio's
      // name would be a phishing surface.
      fromName: 'Lyra',
      fromBox: 'no-reply',
      replyTo: '',
      subject: 'Your sign-in link',
      text: `Hello,\n\nHere is your link to sign in. It works once, and for the next 15 minutes:\n\n${link}\n\nIf you did not ask for this, nothing has happened — you can ignore it.`,
      key: nonce,
    });

    // A deployment with no provider key cannot send, and a developer still has
    // to get in, so the link goes to the log.
    if (!sent.ok) console.log(`\n[lyra] no mail sent (${sent.reason}) — sign-in link for ${email}:\n  ${link}\n`);
    return true;
  },

  'auth.enter': async (data) => {
    // Off unless a deployment names it: this hands out a session for an address
    // somebody typed. One flag, shared with the picker's list in `app.ts`.
    if (process.env['LYRA_DEV_LOGIN'] !== 'on') throw new Error('Sign in with the link we email you.');
    const email = String(data['email'] ?? '').trim();
    const token = await mintToken(deps.runAs, email);
    if (token === null) throw new Error(`No account for ${email}.`);
    session.grant(token);
    return true;
  },

  'auth.leave': async () => {
    session.revoke();
    return true;
  },
});

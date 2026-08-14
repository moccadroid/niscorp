import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { principalByEmail } from '../links';
import { mintToken } from '../tokens';
import { mintLink, tooManyLinks } from '../links';
import { sendMail } from '../mail/send';

type Deps = { runAs: import('@niscorp/moss').ExecuteAs; now: () => number; base: () => string };

export const authFunctions = (session: FunctionSession, deps: Deps): Record<string, FunctionHandler> => ({
  // ONE ANSWER FOR EVERY ADDRESS. Whether somebody has an account here is not
  // this endpoint's news to give: it is public by charter, so a different
  // answer for a known address turns it into a membership oracle — "is my ex a
  // member of this studio" is one request away. Known or not, it says yes.
  'auth.request': async (data) => {
    const email = String(data['email'] ?? '').trim().toLowerCase();
    if (email === '' || !email.includes('@')) throw new Error('That does not look like an email address.');

    // Counted BEFORE the lookup, so refusing costs the same for an address
    // that exists and one that does not — a limit that only applied to real
    // accounts would be the oracle this endpoint just avoided being.
    if (tooManyLinks(email, deps.now())) throw new Error('That is a lot of sign-in links. Try again in a few minutes.');

    const principal = await principalByEmail(deps.runAs, email);
    if (principal === null) return true;

    const nonce = await mintLink(deps.runAs, principal, deps.now());
    const link = `${deps.base().replace(/\/$/, '')}/?login=${nonce}`;

    const sent = await sendMail({
      to: email,
      // PLATFORM MAIL, not a studio's. A person known to two studios resolves
      // to one of them by an arbitrary rule (the oldest anchor), and a sign-in
      // link arriving in a studio's name would be a phishing surface we built
      // on purpose. Nobody replies to a sign-in link either, so no reply-to.
      fromName: 'Lyra',
      fromBox: 'no-reply',
      replyTo: '',
      subject: 'Your sign-in link',
      text: `Hello,\n\nHere is your link to sign in. It works once, and for the next 15 minutes:\n\n${link}\n\nIf you did not ask for this, nothing has happened — you can ignore it.`,
      key: nonce,
    });

    // THE LAB STILL SIGNS IN. A deployment with no provider key cannot send,
    // and a developer still has to get in — so the link goes to the log, which
    // is where it has always gone, and the line SAYS WHICH of the two happened
    // rather than leaving somebody to guess why no mail arrived.
    if (!sent.ok) console.log(`\n[lyra] no mail sent (${sent.reason}) — sign-in link for ${email}:\n  ${link}\n`);
    return true;
  },

  // THE LAB'S PICKER, and it is exactly as unauthenticated as it looks: choose
  // a name, become them. It exists because a seeded demo is worth nothing if
  // reaching each of nine principals costs an inbox, and it is why the picker
  // is on the sign-in screen rather than behind the link.
  //
  // IT IS NOT A PRODUCTION DOOR. It grants a session for any address in the
  // directory without proving anything, which is only survivable while every
  // session token in this app is forgeable anyway (moss's `mintDevToken`).
  // So it now sits behind the same env fence the dev integrations do — see below.
  'auth.enter': async (data) => {
    // BEHIND AN ENV FENCE, like the dev integrations. It is off unless a deployment
    // names it, so a production build cannot be talked into handing out a
    // session for an address somebody typed. The link above is the real path
    // and always works; this is the lab's shortcut through it.
    //
    // ONE flag, shared with the list in `app.ts` — this guard read its own
    // spelling (LYRA_DEV_PICKER) for a while, and the picker was either a
    // list that refused to sign anybody in or a login with no list,
    // depending on which name a .env happened to set.
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

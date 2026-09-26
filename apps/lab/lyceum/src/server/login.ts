import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { mintSession } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { loginIssue, loginRedeem } from '@lyceum/app/vex/login.entries';
import type { SendMail } from './mail';

// HOW THE PRINCIPALS THAT ARE NOT PEOPLE SIGN IN.
//
// /speaker — the speaker asks for a link by email. Only the one address the
// deployment names (LYCEUM_SPEAKER_EMAIL) gets one; every address gets the
// same answer, so the page says nothing about which one that is.
//
// /login?token=… — A ONE-TIME SIGN-IN LINK, redeemed: mailed from /speaker, or
// minted by the operator on the server (`pnpm mint speaker`). The device that
// opens it holds a real session in the principal's own seat. The link is used
// up on the first click and expires unused.
//
// /stage — the projector. Not a secret: the stage shows the deck and the room
// and its role writes nothing (charter.ts), so whoever opens it gets a stage
// session, and sees what the wall already shows.

export const hashLinkToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LINK_TTL_MS = 15 * 60 * 1000;
const RedeemedSchema = z.union([z.object({ principal: z.string() }), z.array(z.object({ principal: z.string() }))]);
const AskedSchema = z.object({ email: z.string() });

export type LoginOptions = {
  publicUrl: string;
  // The speaker's address. Empty: nobody can ask for a link, only `pnpm mint`.
  speakerEmail: string;
  send: SendMail;
};

const page = (body: string): Response =>
  new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lyceum</title><body style="font:16px/1.5 system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem">${body}</body>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

// Into the principal's own seat (src/main.ts), then into the app.
const handOff = (principal: string, session: string): Response =>
  page(`<script>localStorage.setItem(${JSON.stringify(`nisc.token.${principal}`)},${JSON.stringify(session)});location.replace(${JSON.stringify(`/?seat=${principal}`)})</script>`);

const ASK_FORM = `<p>Speaker sign-in. A link is mailed to the speaker's address.</p>
<form method="post" action="/speaker"><input type="email" name="email" required autocomplete="email" placeholder="you@example.com" style="font:inherit;padding:.5rem;width:100%;box-sizing:border-box"><p><button style="font:inherit;padding:.5rem 1rem">Send me a link</button></p></form>`;

const normal = (email: string): string => email.trim().toLowerCase();

export const mountLogin = (server: MossServer, pool: Parameters<typeof mintSession>[0], options: LoginOptions): void => {
  const publicUrl = options.publicUrl.replace(/\/$/, '');

  server.get('/login', async (c) => {
    const token = c.req.query('token') ?? '';
    if (token === '') return page('<p>This sign-in link is incomplete.</p>');
    const redeemed = RedeemedSchema.safeParse(
      await server.executeAs('gatekeeper', loginRedeem.fingerprint, { tokenHash: hashLinkToken(token), now: new Date().toISOString() }),
    );
    const principal = redeemed.success ? (Array.isArray(redeemed.data) ? redeemed.data[0]?.principal : redeemed.data.principal) : undefined;
    if (principal === undefined) return page('<p>This sign-in link has been used or has expired. Ask for a new one.</p>');
    return handOff(principal, await mintSession(pool, principal, SESSION_TTL_MS));
  });

  server.get('/speaker', () => page(ASK_FORM));

  server.post('/speaker', async (c) => {
    const asked = AskedSchema.safeParse(await c.req.parseBody());
    const email = asked.success ? normal(asked.data.email) : '';
    if (options.speakerEmail !== '' && email === normal(options.speakerEmail)) {
      const token = randomBytes(32).toString('base64url');
      await server.executeAs('gatekeeper', loginIssue.fingerprint, {
        tokenHash: hashLinkToken(token),
        principal: 'speaker',
        expiresAt: new Date(Date.now() + LINK_TTL_MS).toISOString(),
      });
      await options
        .send({
          to: email,
          subject: 'Your Lyceum sign-in link',
          text: `Sign in as the speaker:\n\n${publicUrl}/login?token=${token}\n\nThe link works once, within 15 minutes.`,
        })
        .catch((error: unknown) => console.error('[lyceum] the speaker\'s sign-in link was not sent:', error));
    }
    return page('<p>If that is the speaker\'s address, a sign-in link is on its way. It works once, within 15 minutes.</p>');
  });

  server.get('/stage', async () => handOff('stage', await mintSession(pool, 'stage', SESSION_TTL_MS)));
};

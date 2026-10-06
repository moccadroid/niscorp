import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { mintSession, sessionCookies } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { lecternGrant, loginRedeem } from '@lyceum/app/vex/login.entries';

// HOW THE PRINCIPALS THAT ARE NOT PEOPLE SIGN IN. No page here draws anything:
// each route hands the device a session, in its own seat (src/main.ts), and the
// app it then opens is decided like every other — by what that principal holds.
//
// /speaker — a principal of the device's own, granted only the speaker's
// sign-in desk (actions/lectern/): an address, and a link mailed if it is the
// speaker's (functions/lectern.functions.ts). Its own, so nobody else with the
// page open watches the address being typed.
//
// /login?token=… — A ONE-TIME SIGN-IN LINK, redeemed: mailed from the desk, or
// minted by the operator on the server (`pnpm mint speaker`). The device that
// opens it holds a real session in the principal's own seat. The link is used
// up on the first click and expires unused.
//
// /stage — the projector. Not a secret: the stage shows the deck and the room
// and its role writes nothing (charter.ts), so whoever opens it gets a stage
// session, and sees what the wall already shows.

export const hashLinkToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DESK_TTL_MS = 30 * 60 * 1000;
export const LINK_TTL_MS = 15 * 60 * 1000;
const RedeemedSchema = z.union([z.object({ principal: z.string() }), z.array(z.object({ principal: z.string() }))]);

// Into a seat (src/main.ts), then into the app. The session goes into the
// browser's own cookie for that seat, which no script can read — set by this
// answer, so the page it sends the device to is signed in and was never handed
// anything. The terminal decides nothing about it.
const handOff = (request: Request, seat: string, session: string, lastsMs: number): Response => {
  const headers = new Headers({ location: `/?seat=${seat}` });
  for (const cookie of sessionCookies(request, session, { key: `nisc.token.${seat}`, lastsMs })) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
};

export const mountLogin = (server: MossServer, pool: Parameters<typeof mintSession>[0]): void => {
  server.get('/login', async (c) => {
    const token = c.req.query('token') ?? '';
    const redeemed = RedeemedSchema.safeParse(
      token === '' ? null : await server.executeAs('gatekeeper', loginRedeem.fingerprint, { tokenHash: hashLinkToken(token), now: new Date().toISOString() }),
    );
    const principal = redeemed.success ? (Array.isArray(redeemed.data) ? redeemed.data[0]?.principal : redeemed.data.principal) : undefined;
    if (principal === undefined) return c.text('This sign-in link has been used or has expired. Ask for a new one.');
    return handOff(c.req.raw, principal, await mintSession(pool, principal, SESSION_TTL_MS), SESSION_TTL_MS);
  });

  server.get('/speaker', async (c) => {
    const principal = `lectern_${randomBytes(8).toString('hex')}`;
    await server.executeAs('gatekeeper', lecternGrant.fingerprint, { principal });
    return handOff(c.req.raw, 'lectern', await mintSession(pool, principal, DESK_TTL_MS), DESK_TTL_MS);
  });

  server.get('/stage', async (c) => handOff(c.req.raw, 'stage', await mintSession(pool, 'stage', SESSION_TTL_MS), SESSION_TTL_MS));
};

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { mintSession } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { loginRedeem } from '@lyceum/app/vex/login.entries';

// /login?token=… — A ONE-TIME SIGN-IN LINK, redeemed.
//
// For the principals that are not people: the operator mints a link on the
// server (`pnpm mint speaker`), opens it on the device that should be the
// speaker, and that device holds a real session in the principal's own seat.
// The link is used up on the first click and expires unused. A testing
// stand-in for a mailed link — the redemption stays, the transport will change.

export const hashLinkToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RedeemedSchema = z.union([z.object({ principal: z.string() }), z.array(z.object({ principal: z.string() }))]);

const page = (body: string): Response => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

export const mountLogin = (server: MossServer, pool: Parameters<typeof mintSession>[0]): void => {
  server.get('/login', async (c) => {
    const token = c.req.query('token') ?? '';
    if (token === '') return page('<p>This sign-in link is incomplete.</p>');
    const redeemed = RedeemedSchema.safeParse(
      await server.executeAs('gatekeeper', loginRedeem.fingerprint, { tokenHash: hashLinkToken(token), now: new Date().toISOString() }),
    );
    const principal = redeemed.success ? (Array.isArray(redeemed.data) ? redeemed.data[0]?.principal : redeemed.data.principal) : undefined;
    if (principal === undefined) return page('<p>This sign-in link has been used or has expired. Ask for a new one.</p>');
    const session = await mintSession(pool, principal, SESSION_TTL_MS);
    // Into the principal's own seat (src/main.ts), then into the app.
    return page(
      `<script>localStorage.setItem(${JSON.stringify(`nisc.token.${principal}`)},${JSON.stringify(session)});location.replace(${JSON.stringify(`/?seat=${principal}`)})</script>`,
    );
  });
};

import { randomBytes } from 'node:crypto';
import type { PgPool } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// THE SIGN-IN LINK — what goes in the email, and what it is worth.
//
// ⟲ WHAT THIS REPLACES. `auth.request` logged a URL carrying a SESSION token,
// and the browser put it straight into localStorage (main.tsx). So the thing
// sitting in somebody's inbox was the session itself: it never expired, it
// worked any number of times, and anyone who read the mail — or the log, or a
// referrer header, or a shared screen — had the account. That was survivable
// only because nothing ever sent the mail. Sending it is what makes it real,
// which is why this landed in the same step.
//
// WHAT A LINK IS NOW: 256 bits of randomness naming a row, redeemed once,
// inside fifteen minutes, for a session that is minted at redemption and not
// before. The row IS the credential — there is no signature, because a signed
// stateless token would still need a row to be single-use, and once the row
// exists the signature proves nothing the lookup does not. One mechanism, and
// no secret to rotate.
//
// WHAT THIS DOES NOT FIX: the session token it trades for. `mintDevToken` is
// still unsigned base64 that anybody can write for any principal — see moss's
// runtime. That is the identity work's ground, not mail's, and closing the
// link does not close it.
// ═══════════════════════════════════════════════════════════════

const TTL_MS = 15 * 60_000;

/** Long enough to read an email on another device, short enough that a link
 *  left in a browser history is not a standing credential. */
export const linkLifetimeMs = TTL_MS;

export const mintLink = async (pool: PgPool, personId: string, now: number): Promise<string> => {
  // 32 bytes, from the platform's CSPRNG. `Math.random` is not a credential.
  const nonce = randomBytes(32).toString('base64url');
  // Yesterday's dead links go while we are already writing to the table —
  // cheaper than a janitor, and there is no window in which it matters.
  await pool.query('DELETE FROM login_links WHERE expires_at < $1', [new Date(now).toISOString()]);
  await pool.query('INSERT INTO login_links (nonce, person_id, expires_at) VALUES ($1, $2, $3)', [
    nonce,
    personId,
    new Date(now + TTL_MS).toISOString(),
  ]);
  return nonce;
};

/**
 * Spend a link, or refuse. DELETE ... RETURNING, so reading it and using it up
 * are one statement: anything less makes "single-use" mean "single-use unless
 * two requests arrive at the same moment", which is exactly the moment somebody
 * double-clicks a link.
 */
export const redeemLink = async (pool: PgPool, nonce: string, now: number): Promise<string | null> => {
  if (nonce === '') return null;
  const spent = await pool.query('DELETE FROM login_links WHERE nonce = $1 AND expires_at > $2 RETURNING person_id', [
    nonce,
    new Date(now).toISOString(),
  ]);
  const row = spent.rows[0] as { person_id?: string } | undefined;
  return row?.person_id === undefined ? null : String(row.person_id);
};

// ── how often somebody may ask ───────────────────────────────
//
// WITHOUT THIS, `auth.request` IS A MAIL CANNON. It takes an address, it is
// public by charter, and it now sends. Anybody could point it at a stranger a
// thousand times, on our sending domain, and the first thing anyone would
// notice is the domain's reputation.
//
// Keyed on the ADDRESS ASKED FOR rather than on who is asking, because the
// address is the thing being harmed. It leaks nothing about who exists: an
// unknown address is counted, refused and answered exactly like a known one.
//
// In memory, so it is per process and resets on restart — honest for a single
// deployment and the first thing to move when there are two. A shared store
// would be the same three lines against a table.
const WINDOW_MS = 15 * 60_000;
const PER_WINDOW = 3;
const asked = new Map<string, number[]>();

export const tooManyLinks = (email: string, now: number): boolean => {
  const recent = (asked.get(email) ?? []).filter((at) => at > now - WINDOW_MS);
  asked.set(email, [...recent, now]);
  return recent.length >= PER_WINDOW;
};

/** Checks own this — a rate limiter that cannot be reset makes the second test
 *  in a file depend on the first one's arithmetic. */
export const forgetLinkRequests = (): void => asked.clear();

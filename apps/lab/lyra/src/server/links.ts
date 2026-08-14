import { randomBytes } from 'node:crypto';
import type { ExecuteAs } from '@niscorp/moss';

// ═══════════════════════════════════════════════════════════════
// THE SIGN-IN LINK — what goes in the email, and what it is worth.
//
// ⟲ WHAT THIS REPLACES. `auth.request` logged a URL carrying a SESSION token,
// and the browser put it straight into localStorage. The thing in somebody's
// inbox was the session itself. Sending mail is what made that real, which is
// why the nonce landed in the same step as the transport.
//
// WHAT A LINK IS: 256 bits of randomness naming a row, redeemed once, inside
// fifteen minutes, for a session minted at redemption and not before. The row
// IS the credential — no signature, because a signed stateless token would
// still need a row to be single-use.
//
// HOW IT TOUCHES THE DATABASE: it does not. Every read and write here is a
// seeded entry executed as the charter's `credential` role — a role nobody
// wears, holding exactly `people.read` and the `login_links` verbs. The
// engine's own DELETE...RETURNING is what makes redemption single-use when
// somebody double-clicks. This file supplies randomness and composes calls.
// ═══════════════════════════════════════════════════════════════

const TTL_MS = 15 * 60_000;

/** Long enough to read an email on another device, short enough that a link
 *  left in a browser history is not a standing credential. */
export const linkLifetimeMs = TTL_MS;

export const mintLink = async (runAs: ExecuteAs, personId: string, now: number): Promise<string> => {
  // 32 bytes, from the platform's CSPRNG. `Math.random` is not a credential.
  const nonce = randomBytes(32).toString('base64url');
  // Yesterday's dead links go while we are already writing to the table.
  await runAs('credential', 'credential/sweep-links', { now: new Date(now).toISOString() });
  await runAs('credential', 'credential/mint-link', { nonce, personId, expiresAt: new Date(now + TTL_MS).toISOString() });
  return nonce;
};

/** Spend a link, or refuse — the engine's DELETE...RETURNING, so reading it
 *  and using it up are one statement. One empty answer for spent, expired and
 *  never-existed alike. */
export const redeemLink = async (runAs: ExecuteAs, nonce: string, now: number): Promise<string | null> => {
  if (nonce === '') return null;
  const spent = await runAs('credential', 'credential/redeem-link', { nonce, now: new Date(now).toISOString() });
  // The engine answers a one-row write as the row and a many-row write as the
  // array; a redeem is one row when it succeeds and no rows when it refuses.
  const row = (Array.isArray(spent) ? spent[0] : spent) as { person_id?: unknown } | undefined;
  return row?.person_id === undefined || row.person_id === null ? null : String(row.person_id);
};

/** The principal behind a sign-in address — resolved to mint a link, and for
 *  nothing else. Lowercased here; addresses are stored lowercase. */
export const principalByEmail = async (runAs: ExecuteAs, email: string): Promise<string | null> => {
  const address = email.trim().toLowerCase();
  if (address === '') return null;
  const answer = await runAs('credential', 'credential/principal-by-email', { email: address });
  const id = (answer as { person_id?: unknown } | null)?.person_id;
  return id === undefined || id === null || id === '' ? null : String(id);
};

// ── how often somebody may ask ───────────────────────────────
//
// WITHOUT THIS, `auth.request` IS A MAIL CANNON. Keyed on the ADDRESS ASKED
// FOR rather than on who is asking, because the address is the thing being
// harmed; an unknown address is counted, refused and answered exactly like a
// known one. In memory, so per process — honest for a single deployment and
// the first thing to move when there are two.
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

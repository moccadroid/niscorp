import { randomBytes } from 'node:crypto';
import type { ExecuteAs } from '@niscorp/moss';

const TTL_MS = 15 * 60_000;

export const linkLifetimeMs = TTL_MS;

export const mintLink = async (runAs: ExecuteAs, personId: string, now: number): Promise<string> => {
  const nonce = randomBytes(32).toString('base64url');
  await runAs('credential', 'credential/sweep-links', { now: new Date(now).toISOString() });
  await runAs('credential', 'credential/mint-link', { nonce, personId, expiresAt: new Date(now + TTL_MS).toISOString() });
  return nonce;
};

/** The entry is the engine's DELETE...RETURNING, so reading a link and using
 *  it up are one statement. */
export const redeemLink = async (runAs: ExecuteAs, nonce: string, now: number): Promise<string | null> => {
  if (nonce === '') return null;
  const spent = await runAs('credential', 'credential/redeem-link', { nonce, now: new Date(now).toISOString() });
  // The engine answers a one-row write as the row and a many-row write as the
  // array; a redeem is one row when it succeeds and no rows when it refuses.
  const row = (Array.isArray(spent) ? spent[0] : spent) as { person_id?: unknown } | undefined;
  return row?.person_id === undefined || row.person_id === null ? null : String(row.person_id);
};

export const principalByEmail = async (runAs: ExecuteAs, email: string): Promise<string | null> => {
  const address = email.trim().toLowerCase();
  if (address === '') return null;
  const answer = await runAs('credential', 'credential/principal-by-email', { email: address });
  const id = (answer as { person_id?: unknown } | null)?.person_id;
  return id === undefined || id === null || id === '' ? null : String(id);
};

// Keyed on the address asked for, not on who is asking: an unknown address is
// counted and refused exactly like a known one. In memory, so per process.
const WINDOW_MS = 15 * 60_000;
const PER_WINDOW = 3;
const asked = new Map<string, number[]>();

export const tooManyLinks = (email: string, now: number): boolean => {
  const recent = (asked.get(email) ?? []).filter((at) => at > now - WINDOW_MS);
  asked.set(email, [...recent, now]);
  return recent.length >= PER_WINDOW;
};

export const forgetLinkRequests = (): void => asked.clear();

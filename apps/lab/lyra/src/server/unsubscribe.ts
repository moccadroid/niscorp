import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ExecuteAs } from '@niscorp/moss';

// ═══════════════════════════════════════════════════════════════
// ONE CLICK, NO SESSION — the other half of consent.
//
// An unsubscribe link is opened by somebody who is not signed in, on a phone,
// possibly years later, and quite possibly by Gmail itself rather than by a
// human (List-Unsubscribe-Post: One-Click, which the large mailbox providers
// now expect from anybody sending in volume). So it cannot ask for a session
// and it cannot fail on a stale credential.
//
// NO TABLE. The token is an HMAC over (studio, person) with the deployment's
// seed: it is unguessable without the seed, it needs no row, it survives a
// database that has been reseeded, and it never expires — which is correct
// here and wrong for a sign-in link (see links.ts, where the opposite choice
// is made for the opposite reason). Unsubscribing is idempotent and harmless
// to repeat; signing in is neither.
//
// WHAT A LEAKED TOKEN BUYS: the ability to stop one person at one studio
// receiving marketing. That is the whole blast radius, and it is why this is a
// signature rather than a session.
// ═══════════════════════════════════════════════════════════════

const seed = (): string => process.env['LYRA_SIGNING_SEED'] ?? '';

const sign = (payload: string): string =>
  createHmac('sha256', seed()).update(payload).digest('base64url');

/** `<studio>.<person>.<signature>` — readable, so a support request can be
 *  answered by looking at it, and unforgeable without the seed. */
export const unsubscribeToken = (studioId: string, personId: string): string => {
  const payload = `${studioId}.${personId}`;
  return `${payload}.${sign(payload)}`;
};

/** Empty when the deployment holds no seed — which is a refusal, not a
 *  detail. A marketing message whose opt-out cannot be verified is a message
 *  that must not go: the caller checks for the empty string and records why,
 *  rather than mailing somebody a link that will always answer "not one we
 *  recognise". */
export const unsubscribeUrl = (base: string, studioId: string, personId: string): string =>
  seed() === '' ? '' : `${base.replace(/\/$/, '')}/api/unsubscribe/${unsubscribeToken(studioId, personId)}`;

/**
 * Verify and spend. Returns what it flipped, or null — one answer for a
 * forged token, a wrong signature and a person who was never opted in, because
 * telling them apart would make this a place to test guesses against.
 */
export const unsubscribe = async (runAs: ExecuteAs, token: string): Promise<{ studioId: string; personId: string } | null> => {
  if (seed() === '') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [studioId, personId, offered] = parts as [string, string, string];
  const expected = sign(`${studioId}.${personId}`);
  // Constant time, because a comparison that returns early is a comparison
  // that tells you how much of a guess was right.
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Through the engine, as the charter's `mailer` role: one column, on one
  // row, and the `mailer` reach pins the write to exactly the pair this
  // signature verified — scope values supplied here, never by a request.
  await runAs('mailer', 'mailer/opt-out', { studioId, personId }, { studioId, personId });
  return { studioId, personId };
};

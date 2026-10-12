import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ExecuteAs } from '@niscorp/moss';

// The token is an HMAC over (studio, person): no row and no expiry, because the
// link is opened without a session, possibly years later, or by the mailbox
// provider itself. A leaked one only stops one person's marketing at one studio.

const seed = (): string => process.env['LYRA_SIGNING_SEED'] ?? '';

const sign = (payload: string): string =>
  createHmac('sha256', seed()).update(payload).digest('base64url');

export const unsubscribeToken = (studioId: string, personId: string): string => {
  const payload = `${studioId}.${personId}`;
  return `${payload}.${sign(payload)}`;
};

export const unsubscribeUrl = (base: string, studioId: string, personId: string): string =>
  seed() === '' ? '' : `${base.replace(/\/$/, '')}/api/unsubscribe/${unsubscribeToken(studioId, personId)}`;

export const unsubscribe = async (runAs: ExecuteAs, token: string): Promise<{ studioId: string; personId: string } | null> => {
  if (seed() === '') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [studioId, personId, offered] = parts as [string, string, string];
  const expected = sign(`${studioId}.${personId}`);
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // The `mailer` reach pins the write to exactly the pair this signature
  // verified: the scope values are supplied here, never by a request.
  await runAs('mailer', 'mailer/opt-out', { studioId, personId }, { studioId, personId });
  return { studioId, personId };
};

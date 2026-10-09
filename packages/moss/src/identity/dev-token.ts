import { z } from 'zod';

// The dev token pair — mint on the client stub, verify on the server;
// base64url JSON, `sub` is the principal. No signature, no expiry: anybody
// who can spell a principal's id can be them. Reachable ONLY through
// `session: 'dev-open'`, which announces itself at boot — this used to be
// the silent default, and one app ran production on it for its whole life
// before a review noticed. Real credentials live in ./sessions.ts.
export const mintDevToken = (sub: string, claims: Record<string, unknown> = {}): string =>
  btoa(JSON.stringify({ sub, ...claims, iat: Date.now() }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// What a dev token is read for: its `sub`. Whatever else was minted into it
// rides along unread.
const DevTokenSchema = z.object({ sub: z.string() });

export const devSession = (token: string): string | null => {
  try {
    const parsed = DevTokenSchema.safeParse(JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/'))));
    return parsed.success ? parsed.data.sub : null;
  } catch {
    return null;
  }
};

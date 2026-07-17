import type { MutationClient, PgPool, CacheBackend } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// What the app runs ON — the environment, not the application: a database
// (pool for SQL, client for mutations), optionally a cache backend
// (defaults to vex's postgres cache on the same pool — the seeded-cache
// posture) and a session verifier (defaults to the dev token below; real
// auth replaces that one function).
// ═══════════════════════════════════════════════════════════════

export type NiscRuntime = {
  pool: PgPool;
  db: MutationClient;
  cache?: CacheBackend;
  session?: (token: string) => string | null | Promise<string | null>;
};

// The dev token pair — mint on the client stub, verify on the server;
// base64url JSON, `sub` is the principal. Real auth replaces both ends
// together; nothing else in an app touches token mechanics.
export const mintDevToken = (sub: string, claims: Record<string, unknown> = {}): string =>
  btoa(JSON.stringify({ sub, ...claims, iat: Date.now() }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export const devSession = (token: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/')));
    const sub = (parsed as Record<string, unknown> | null)?.['sub'];
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
};

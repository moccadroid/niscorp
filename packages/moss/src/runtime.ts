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
  // How long a durable server shell may sit with no terminal attached before
  // it is disposed (default: 30 minutes; `0` disables the sweep). An
  // environment knob rather than a manifest one, because it trades memory
  // against a rebuild on the next connect — an operational decision about a
  // deployment, not something an application is written against.
  shellIdleMs?: number;
  // How often a live socket's credential is re-verified through `session`
  // (default: 60 seconds; `0` disables it). The HTTP surfaces re-ask on every
  // request; this is what makes the socket ask too, so a `session` that gives
  // its tokens an expiry has that expiry mean something on a connection
  // somebody is holding open. Costs one `session` call per authenticated
  // connection per interval — the knob is here for a verifier that is
  // expensive to ask.
  sessionRevalidateMs?: number;
  // THE OPERATOR KEY — the whole authentication story for the seam below.
  //
  // Registering an integration is a PLATFORM act, not a tenant one: it points
  // the deployment at a service and approves what that service may read. No
  // principal should be able to do it, which means it cannot live on a
  // principal-authenticated surface at all.
  //
  // Absent = the seam does not exist. Every route under it answers 404, which is
  // also what a wrong key gets: a tool cannot tell an unset key from a bad one,
  // and neither can anybody else.
  operatorKey?: string;
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

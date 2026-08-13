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
  // Send each canvas frame as a DELTA against the last one this connection
  // received, rather than whole (default: off).
  //
  // A shell re-sends a canvas whenever its tree changes, and most changes are
  // small against a large tree — a keystroke filtering a list rewrites a few
  // hundred bytes of several thousand. Measured on Lyra: an in-place update
  // falls to 1–4% of the frame, a navigation to about 80% before the
  // transport's own compression. It costs one encode per changed canvas per
  // flush and one previous frame held per canvas, which the host keeps anyway
  // for its unchanged-frame check.
  //
  // Off by default because it is a protocol change: a terminal that does not
  // advertise support keeps receiving whole frames, and a delta that fails its
  // checksum makes the terminal ask for a whole one. See DOCS.md § Frame
  // deltas.
  shellFrameDelta?: boolean;
  // WebSocket permessage-deflate (default: on).
  //
  // Compresses every frame — roughly 3–4× on rendered trees, which are mostly
  // repeated keys. The cost is memory, and it is not small: measured at ~260 KB
  // of resident memory per connection at the `ws` defaults, against ~43 KB for
  // the shell being served. That trade is right at hundreds of connections and
  // wrong at a hundred thousand, which is why it is a knob and not a constant.
  // `false` disables it; an object is passed through to `ws` for tuning.
  socketCompression?: boolean | Record<string, unknown>;
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

  // A FIXED SEED FOR THE ASSERTION SIGNING KEYPAIR — dev only, and off by
  // default (assert.ts). Without it the keypair regenerates every boot, which
  // on an in-memory database means an integration's held public key goes stale
  // on every restart and it starts refusing calls. Setting it makes the public
  // half stable, so a separate service's environment stays valid across
  // restarts. A deployment leaves this unset and keeps the ephemeral key.
  signingSeed?: string;
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

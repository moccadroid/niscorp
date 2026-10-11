import type { Telemetry } from '../runtime';
import type { ShellHost } from '../shells';

// ═══════════════════════════════════════════════════════════════
// WHAT THE SOCKET IS HANDED.
//
// Each member is one function or one value of whoever owns it. The socket is
// handed no application manifest, no runtime and no shell host: whoever stands
// it up (../server) says where each comes from.
// ═══════════════════════════════════════════════════════════════

// WHAT THE SOCKET ASKS OF A SHELL HOST (../shells): the session a connection is
// attached to. One function of the host, so a host is handed here as that and
// no more.
export type SessionSource = Pick<ShellHost, 'session'>;

// What somebody holds of the application, as `hello` says it: the ids of the
// actions granted to them, and the version token of that set. Written out
// here: whoever stands the socket up says where it comes from.
export type HeldCatalog = { ids: readonly string[]; hash: string };

export type SocketConfig = {
  session: (token: string) => string | null | Promise<string | null>;
  catalog: (principal: string | null) => HeldCatalog | Promise<HeldCatalog>;
  // The shell host — when the manifest declares a shell, events route into
  // the session's server shell and render frames flow back.
  shells?: SessionSource;
  // WHICH HOST A PATH LEADS TO. A terminal on a page names the path it is on
  // (`?path=`); this answers with that page's host and the input its path
  // carries, or undefined for a path that is the app's. Absent: every
  // connection is the app's.
  page?: (path: string) => { host: SessionSource; inputs: Record<string, Record<string, unknown>> } | undefined;
  // How many shells for nobody signed in may be alive at once (./anonymous-shell-limit.ts).
  // Default `DEFAULT_ANONYMOUS_SHELL_MAX`; `Infinity` is no limit.
  anonymousShellMax?: number;
  // How often a LIVE connection's credential is re-verified. Default
  // `DEFAULT_REVALIDATE_MS`; `0` or `Infinity` disables it, and a token
  // checked once at upgrade is then trusted for the life of the connection.
  revalidateMs?: number;
  // The deployment's telemetry sink, if any — a `socket.upgrade` span per
  // connection admitted or refused, and a `socket.close` span carrying the
  // whole connection's lifetime. See ../runtime, telemetry.ts.
  telemetry?: Telemetry;
  // Origins that are this app's own page beside the host a request is
  // addressed to (`runtime.origins`) — a proxy that rewrites `Host`.
  origins?: readonly string[];
  // How much longer a token resolves, when the credential knows — how long a
  // browser is told to keep the cookie that carries it. Unknown: until the
  // browser closes.
  sessionLastsMs?: (token: string) => number | null | Promise<number | null>;
};

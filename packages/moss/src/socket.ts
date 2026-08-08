import type { RenderNode } from '@niscorp/nova';
import type { Catalog } from './principal';
import type { ShellHost } from './shells';

// ═══════════════════════════════════════════════════════════════
// The socket — the authority channel (DESIGN.md § The socket), protocol layer.
//
// The socket invents nothing: JSON frames, every canvas-bound message
// carries its canvas id, reconnect just re-sends current state. This
// module is transport-blind — it speaks through the four-function
// `Connection` seam; the RFC 6455 plumbing lives with each runtime's
// entry (`ws` on Node in ./node, Bun-native later) and is never
// hand-written.
//
// What rides it: connection lifecycle, token auth at upgrade, the CATALOG
// channel (`hello` on connect — the resolved application + its version
// token; equal hash, equal application), and the canvas streams (`render`
// down, `event` up) fed by the server shell host. An app whose manifest
// declares no shell has no streams, and an event envelope aimed at one is
// answered honestly with `no_shell` rather than silently dropped.
//
// Identity is asked twice: once at upgrade, and then on a timer for as long
// as the connection lives (see DEFAULT_REVALIDATE_MS). The second is what
// lets a `session` verifier's expiry mean anything here — the HTTP surfaces
// re-ask on every request, and a socket that asked once would be the hole
// every long-lived credential leaks through.
// ═══════════════════════════════════════════════════════════════

// The transport seam — what a runtime's websocket must provide. Four
// functions; everything above them is identical on every runtime.
export type Connection = {
  send: (text: string) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: (fn: (text: string) => void) => void;
  onClose: (fn: () => void) => void;
};

// ── The envelope ──
export type ServerMessage =
  | { type: 'hello'; principal: string | null; catalog: { actions: readonly string[]; hash: string } }
  | { type: 'catalog'; actions: readonly string[]; hash: string }
  // the shell's canvas ARRANGEMENT — a rendered layout whose CanvasSlot
  // markers the terminal resolves against its per-canvas trees
  | { type: 'frame'; tree: RenderNode[] }
  | { type: 'render'; canvas: string; tree: RenderNode[] }
  // session GRANT (login succeeded server-side): store the token and
  // reconnect authenticated — the twin of the 4403 SIGNED_OUT revoke
  | { type: 'session'; token: string }
  | { type: 'error'; code: string; message: string; canvas?: string };

export type ClientMessage =
  | { type: 'event'; canvas: string; event: Record<string, unknown> }
  | { type: 'publish'; channel: string; payload?: unknown }
  // RESET: throw this session's shell away and serve its replacement. The one
  // message that names no canvas, deliberately — it is the recovery for a
  // shell whose canvases are the broken thing, so it must not have to travel
  // through one. Protocol-level, not app-level: no action declares it, no
  // charter grants it, and it reaches a terminal whose every surface is dead.
  | { type: 'reset' };

// Application close code: the token did not resolve to a principal.
export const CLOSE_INVALID_TOKEN = 4401;
// Application close code: the session ended (sign-out, from any of the
// principal's terminals) — the terminal clears its token instead of
// reconnecting.
export const CLOSE_SIGNED_OUT = 4403;

export type SocketContext = {
  session: (token: string) => string | null | Promise<string | null>;
  catalog: (principal: string | null) => Catalog;
  // The shell host — when the manifest declares a shell, events route into
  // the session's server shell and render frames flow back.
  shells?: ShellHost;
  // How often a LIVE connection's credential is re-verified. Default
  // `DEFAULT_REVALIDATE_MS`; `0` or `Infinity` disables it, and a token
  // checked once at upgrade is then trusted for the life of the connection.
  revalidateMs?: number;
};

// ── Revalidation ──
// The HTTP surfaces re-ask "who is this" on every request; the socket asked
// once, at upgrade, and never again. That asymmetry is why an app could not
// give its tokens an expiry that meant anything: the verifier seam is
// perfectly able to say a token has died (return null), but on a live socket
// nobody was listening for the answer.
//
// It also failed in a shape worth naming. The server shell's own wire rides
// the HTTP middleware carrying the session's token, so an expired credential
// used to leave the socket open and cheerful — frames flowing, screen alive —
// while every endpoint the shell called came back 401. A live interface whose
// every load silently fails is strictly worse than a lock screen.
//
// The recovery for this already existed and is untouched: a `4401` close is a
// recovery, not a retry, and the terminal drops its token and reconnects
// anonymous onto the served lock screen. All that was missing was something
// asking the question. This is that.
export const DEFAULT_REVALIDATE_MS = 60 * 1000;

// One accept per new connection: authenticate (the token rides the upgrade
// URL — browsers cannot set websocket headers; absent = the anonymous
// principal, invalid = closed with 4401), then say hello with the resolved
// catalog and settle into the message loop. `stop` ends revalidation, for
// hosts that outlive their server (dev checks, embedded tools) — the timer is
// unref'd, so a plain process needn't call it.
export type SocketAccept = ((url: string, connection: Connection) => Promise<void>) & { stop: () => void };

const parse = (text: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const createSocket = (ctx: SocketContext): SocketAccept => {
  // Every live connection, with the credential it authenticated under (null =
  // anonymous, which has nothing that can expire). One structure: the future
  // catalog-push fan-out wants the keys, revalidation wants the values.
  const live = new Map<Connection, { token: string; principal: string } | null>();

  const expire = (connection: Connection): void => {
    // Diagnostics before authority, as at upgrade — the close code is what
    // the terminal acts on; this is what a person reads in a log.
    connection.send(JSON.stringify({ type: 'error', code: 'invalid_token', message: 'The session token no longer resolves to this principal.' } satisfies ServerMessage));
    connection.close(CLOSE_INVALID_TOKEN, 'session expired');
    live.delete(connection);
  };

  const revalidate = async (): Promise<void> => {
    for (const [connection, credential] of [...live]) {
      if (credential === null) continue; // anonymous — nothing to expire
      let resolved: string | null;
      try {
        resolved = await ctx.session(credential.token);
      } catch {
        // The verifier is unreachable — a database blip, a network hiccup.
        // That is not evidence a session ended, and signing everybody out on
        // it would turn a transient fault into an outage. Ask again next pass.
        continue;
      }
      // Unchanged is the overwhelmingly common answer. A token that stops
      // resolving has expired or been revoked; one that resolves to somebody
      // ELSE is not the session that attached, and both are the same close.
      if (resolved === credential.principal) continue;
      if (!live.has(connection)) continue; // it closed while we were awaiting
      expire(connection);
    }
  };

  const revalidateMs = ctx.revalidateMs ?? DEFAULT_REVALIDATE_MS;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  if (revalidateMs > 0 && Number.isFinite(revalidateMs)) {
    sweeper = setInterval(() => void revalidate(), revalidateMs);
    // Revalidation must never be the reason a process stays alive.
    (sweeper as unknown as { unref?: () => void }).unref?.();
  }

  const accept = async (url: string, connection: Connection): Promise<void> => {
    const send = (message: ServerMessage): void => connection.send(JSON.stringify(message));

    const token = new URL(url, 'http://nisc.local').searchParams.get('token');
    let principal: string | null = null;
    if (token !== null && token !== '') {
      principal = await ctx.session(token);
      if (principal === null) {
        send({ type: 'error', code: 'invalid_token', message: 'The session token did not resolve to a principal.' });
        connection.close(CLOSE_INVALID_TOKEN, 'invalid token');
        return;
      }
    }

    // Remembered WITH its credential — revalidation has to re-ask the same
    // question this connection was admitted on, and the token is not
    // recoverable from anything else here.
    live.set(connection, token !== null && token !== '' && principal !== null ? { token, principal } : null);
    connection.onClose(() => live.delete(connection));

    // The catalog channel: the application, resolved for YOU, on every
    // (re)connect — reconnect re-sends current state, no replay machinery.
    const { ids, hash } = ctx.catalog(principal);
    send({ type: 'hello', principal, catalog: { actions: ids, hash } });

    // The canvas streams: attach to the session's shell (durable per
    // principal — the shell outlives this connection) and it re-sends the
    // current trees; every change fans out to every attached connection.
    const session = ctx.shells?.session(token, principal);
    if (session !== undefined) {
      session.attach(connection);
      connection.onClose(() => session.detach(connection));
    }

    connection.onMessage((text) => {
      const message = parse(text);
      // Reset first, and answered on its own terms: a wedged session is
      // exactly the one whose other paths cannot be trusted to run.
      if (message !== null && message['type'] === 'reset') {
        if (session === undefined) {
          send({ type: 'error', code: 'no_shell', message: 'This app serves no shell.' });
          return;
        }
        session.reset();
        return;
      }
      if (message !== null && message['type'] === 'publish' && typeof message['channel'] === 'string') {
        if (session === undefined) {
          send({ type: 'error', code: 'no_shell', message: 'This app serves no shell.' });
          return;
        }
        session.publish(message['channel'], message['payload']);
        return;
      }
      if (message === null || message['type'] !== 'event' || typeof message['canvas'] !== 'string') {
        send({ type: 'error', code: 'invalid_message', message: 'Messages are JSON { type: "event", canvas, event }.' });
        return;
      }
      if (session === undefined) {
        send({ type: 'error', code: 'no_shell', message: 'This app serves no shell.', canvas: message['canvas'] });
        return;
      }
      const event = message['event'];
      if (event === null || typeof event !== 'object' || Array.isArray(event)) {
        send({ type: 'error', code: 'invalid_message', message: 'The event field must be a NovaEvent object.', canvas: message['canvas'] });
        return;
      }
      session.dispatch(message['canvas'], event as Record<string, unknown>);
    });
  };

  return Object.assign(accept, {
    stop: () => {
      if (sweeper !== undefined) clearInterval(sweeper);
      sweeper = undefined;
    },
  });
};

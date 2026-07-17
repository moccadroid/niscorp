import type { RenderNode } from '@niscorp/nova';
import type { Catalog } from './principal';
import type { ShellHost } from './shells';

// ═══════════════════════════════════════════════════════════════
// The socket — the authority channel (SERVER.md §3), protocol layer.
//
// The socket invents nothing: JSON frames, every canvas-bound message
// carries its canvas id, reconnect just re-sends current state. This
// module is transport-blind — it speaks through the four-function
// `Connection` seam; the RFC 6455 plumbing lives with each runtime's
// entry (`ws` on Node in ./node, Bun-native later) and is never
// hand-written.
//
// Standing in 3b.1: connection lifecycle, token auth at upgrade, and the
// CATALOG channel (`hello` on connect — the resolved application + its
// version token; equal hash, equal application). Canvas streams (`render`
// down, `event` up) arrive with the server shell host (3b.2) — until
// then an event envelope is answered honestly with `no_shell`.
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
  | { type: 'publish'; channel: string; payload?: unknown };

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
};

// One accept per new connection: authenticate (the token rides the upgrade
// URL — browsers cannot set websocket headers; absent = the anonymous
// principal, invalid = closed with 4401), then say hello with the resolved
// catalog and settle into the message loop.
export type SocketAccept = (url: string, connection: Connection) => Promise<void>;

const parse = (text: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const createSocket = (ctx: SocketContext): SocketAccept => {
  const connections = new Set<Connection>(); // the future catalog-push fan-out

  return async (url, connection) => {
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

    connections.add(connection);
    connection.onClose(() => connections.delete(connection));

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
};

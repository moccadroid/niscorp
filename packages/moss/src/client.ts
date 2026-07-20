import type { NovaEvent, RenderNode } from '@niscorp/nova';
import { CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT } from './socket';

// ═══════════════════════════════════════════════════════════════
// The wire — moss's protocol client, the other end of ./socket. Plain
// code: a token slot, a websocket with reconnect, and session lifecycle —
// a `session` message (login redeemed server-side) stores the token and
// reconnects authenticated; a 4403 close clears it and reconnects
// anonymous (the lock screen is the anonymous principal's application,
// served like everything else). Rendering the snapshot is the app's
// (framework's) business; nothing framework-shaped lives here.
// ═══════════════════════════════════════════════════════════════

export type WireConfig = {
  // The socket url; default: `/socket` on the serving host.
  url?: string;
  // The localStorage key holding the session token.
  tokenKey?: string;
};

export type WireSnapshot = {
  // the frame: the canvas ARRANGEMENT — a served layout whose CanvasSlot
  // markers resolve against `trees`
  frame: RenderNode[];
  // the current tree per canvas id
  trees: ReadonlyMap<string, RenderNode[]>;
};

export type Wire = {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => WireSnapshot;
  // an event from inside a canvas, tagged with the canvas it came from
  dispatch: (canvasId: string, event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;
  dispose: () => void;
};

type ClientMessage =
  | { type: 'event'; canvas: string; event: Record<string, unknown> }
  | { type: 'publish'; channel: string; payload?: unknown };

const EMPTY: WireSnapshot = { frame: [], trees: new Map() };

export const createWire = (config: WireConfig = {}): Wire => {
  const tokenKey = config.tokenKey ?? 'nisc.token';
  const readToken = (): string | null => {
    try {
      return window.localStorage.getItem(tokenKey);
    } catch {
      return null;
    }
  };
  const writeToken = (token: string | null): void => {
    try {
      if (token === null) window.localStorage.removeItem(tokenKey);
      else window.localStorage.setItem(tokenKey, token);
    } catch {
      /* storage unavailable — the session lives for this page only */
    }
  };

  let token = readToken();
  let snapshot: WireSnapshot = EMPTY;
  let socket: WebSocket | null = null;
  let retry: number | undefined;
  // Consecutive failed connects — resets to 0 the moment one opens. Drives the
  // reconnect backoff so a dead server is polled ever more slowly, not every
  // second forever.
  let attempts = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const publishSnapshot = (next: WireSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const url = (): string => {
    if (config.url !== undefined) return config.url;
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${window.location.host}/socket`;
  };

  const connect = (): void => {
    if (disposed) return;
    const query = token === null ? '' : `?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(`${url()}${query}`);
    socket = ws;
    // A connection that opens is a healthy connection: forget the backoff.
    ws.onopen = () => {
      attempts = 0;
    };
    ws.onmessage = (e) => {
      const data = JSON.parse(String(e.data)) as {
        type: string;
        canvas?: string;
        tree?: RenderNode[];
        token?: string;
        code?: string;
        message?: string;
      };
      if (data.type === 'render' && data.canvas !== undefined && data.tree !== undefined) {
        publishSnapshot({ ...snapshot, trees: new Map(snapshot.trees).set(data.canvas, data.tree) });
      } else if (data.type === 'frame' && data.tree !== undefined) {
        publishSnapshot({ ...snapshot, frame: data.tree });
      } else if (data.type === 'session' && typeof data.token === 'string') {
        // Login redeemed server-side: become that principal.
        become(data.token);
      } else if (data.type === 'error') {
        // Diagnostics, not authority — surfaced, never swallowed: a wire that
        // silently stops updating is the worst thing to debug. (invalid_token
        // rides the 4401 close below, not this path.)
        console.warn(`[moss/wire] server error${data.code !== undefined ? ` (${data.code})` : ''}: ${data.message ?? ''}`);
      } else if (data.type !== 'hello' && data.type !== 'catalog') {
        // hello/catalog are known and deliberately ignored (the terminal is
        // grant-blind — it renders what it is served, never what it may do);
        // anything else is protocol drift worth a shout.
        console.warn(`[moss/wire] unhandled server message: ${data.type}`);
      }
    };
    // The socket is ephemeral, the shell is durable: reconnect re-sends
    // current state. Two application close codes are recoveries, not retries —
    // SIGNED_OUT (a deliberate revoke) and INVALID_TOKEN (the stored token went
    // stale; retrying WITH it would loop forever) both drop the token and
    // reconnect anonymous (the served lock screen). Every other close backs off
    // and retries carrying the current token.
    ws.onclose = (e) => {
      if (e.code === CLOSE_SIGNED_OUT || e.code === CLOSE_INVALID_TOKEN) {
        become(null);
        return;
      }
      if (!disposed) scheduleReconnect();
    };
  };

  // Exponential backoff with jitter, capped: a dead server is polled ever more
  // slowly (never faster than ~½s, never slower than the cap), and the jitter
  // spreads a thundering herd of terminals reconnecting on the same outage.
  const RECONNECT_CAP_MS = 30_000;
  const scheduleReconnect = (): void => {
    const ceiling = Math.min(RECONNECT_CAP_MS, 1000 * 2 ** attempts);
    attempts += 1;
    const delay = ceiling / 2 + Math.random() * (ceiling / 2);
    retry = window.setTimeout(connect, delay);
  };

  // A different principal — possibly none — is a different application:
  // store the token, blank the screen, reconnect.
  const become = (next: string | null): void => {
    writeToken(next);
    token = next;
    window.clearTimeout(retry);
    attempts = 0; // a new principal is a fresh session — start backoff clean
    publishSnapshot(EMPTY);
    const old = socket;
    socket = null;
    if (old !== null) {
      old.onclose = null;
      old.close();
    }
    connect();
  };

  connect();

  const send = (message: ClientMessage): void => socket?.send(JSON.stringify(message));

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
    dispatch: (canvasId, event) => send({ type: 'event', canvas: canvasId, event: event as unknown as Record<string, unknown> }),
    publish: (channel, payload) => send(payload === undefined ? { type: 'publish', channel } : { type: 'publish', channel, payload }),
    dispose: () => {
      disposed = true;
      window.clearTimeout(retry);
      socket?.close();
    },
  };
};

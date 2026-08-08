import type { NovaEvent, RenderNode } from '@niscorp/nova';
import { CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT } from '../socket';

// ═══════════════════════════════════════════════════════════════
// The wire — moss's protocol client, the other end of ../socket. Plain
// code: a token slot, a websocket with reconnect, and session lifecycle —
// a `session` message (login redeemed server-side) stores the token and
// reconnects authenticated; a 4403 close clears it and reconnects
// anonymous (the lock screen is the anonymous principal's application,
// served like everything else). Rendering the snapshot is the app's
// (framework's) business; nothing framework-shaped lives here.
//
// The wire never reaches for globals: everything host-shaped — where the
// token lives, how a socket is constructed, what url "here" means — comes
// in as a `WireEnv`. `browserEnv` (the default) is localStorage + location;
// `./node` ships `nodeEnv` (a token file, an explicit url). The socket API
// itself is WHATWG-standard in every host (browser, Node ≥22, Bun), so an
// env only constructs it.
// ═══════════════════════════════════════════════════════════════

// Where the session token lives between connects.
export type WireTokenStore = {
  load: () => string | null;
  save: (token: string) => void;
  clear: () => void;
};

// The host seam: what the wire would otherwise take from globals.
export type WireEnv = {
  tokens: WireTokenStore;
  // construct a socket for this url — `new WebSocket(url)` in every host
  socket: (url: string) => WebSocket;
  // the socket url when `config.url` is absent
  defaultUrl: () => string;
};

export type WireConfig = {
  // The socket url; default: `env.defaultUrl()`.
  url?: string;
  // The host environment; default: `browserEnv()`.
  env?: WireEnv;
};

export type WireSnapshot = {
  // the frame: the canvas ARRANGEMENT — a served layout whose CanvasSlot
  // markers resolve against `trees`
  frame: RenderNode[];
  // the current tree per canvas id
  trees: ReadonlyMap<string, RenderNode[]>;
};

// The socket's health, as a renderer needs it: `connecting` (a connect is in
// flight or scheduled), `open`, `closed` (lost; a retry will flip it back to
// connecting). Status changes notify subscribers like snapshot changes do —
// a terminal that renders nothing on a dead socket is indistinguishable from
// a working terminal rendering an empty app, so the state must be readable.
export type WireStatus = 'connecting' | 'open' | 'closed';

export type Wire = {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => WireSnapshot;
  status: () => WireStatus;
  // an event from inside a canvas, tagged with the canvas it came from
  dispatch: (canvasId: string, event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;
  // Ask the server to throw this session's shell away and serve a fresh one —
  // the escape from a wedged shell, and the only one that can work. The shell
  // is SERVER state keyed by principal: dropping the token here would just
  // hand us a throwaway anonymous shell, and signing back in would reattach
  // to the same wreck. On a dead socket this reconnects instead, which is the
  // same recovery one layer down.
  reset: () => void;
  dispose: () => void;
};

type ClientMessage =
  | { type: 'event'; canvas: string; event: Record<string, unknown> }
  | { type: 'publish'; channel: string; payload?: unknown }
  | { type: 'reset' };

const EMPTY: WireSnapshot = { frame: [], trees: new Map() };

// The browser host: token in localStorage, url derived from location, the
// page's WebSocket. The try/catches keep a storage-less context (private
// mode, sandboxed iframe) alive — the session just lives for this page only.
export const browserEnv = (config: { tokenKey?: string } = {}): WireEnv => {
  const tokenKey = config.tokenKey ?? 'nisc.token';
  return {
    tokens: {
      load: () => {
        try {
          return window.localStorage.getItem(tokenKey);
        } catch {
          return null;
        }
      },
      save: (token) => {
        try {
          window.localStorage.setItem(tokenKey, token);
        } catch {
          /* storage unavailable — the session lives for this page only */
        }
      },
      clear: () => {
        try {
          window.localStorage.removeItem(tokenKey);
        } catch {
          /* nothing stored, nothing to clear */
        }
      },
    },
    socket: (url) => new WebSocket(url),
    defaultUrl: () => {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${scheme}://${window.location.host}/socket`;
    },
  };
};

export const createWire = (config: WireConfig = {}): Wire => {
  const env = config.env ?? browserEnv();

  let token = env.tokens.load();
  let snapshot: WireSnapshot = EMPTY;
  let status: WireStatus = 'connecting';
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
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
  const setStatus = (next: WireStatus): void => {
    if (status === next) return;
    status = next;
    for (const listener of listeners) listener();
  };

  const url = (): string => config.url ?? env.defaultUrl();

  const connect = (): void => {
    if (disposed) return;
    setStatus('connecting');
    const query = token === null ? '' : `?token=${encodeURIComponent(token)}`;
    const ws = env.socket(`${url()}${query}`);
    socket = ws;
    // A connection that opens is a healthy connection: forget the backoff.
    ws.onopen = () => {
      attempts = 0;
      setStatus('open');
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
        // silently stops updating is the worst thing to debug. `invalid_token`
        // arrives here too, from the server's revalidation pass, and it is
        // worth the line: the AUTHORITY is the 4401 close that follows (see
        // onclose), and this is the breadcrumb saying the session expired
        // rather than the network dropping.
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
      setStatus('closed');
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
    retry = setTimeout(connect, delay);
  };

  // A different principal — possibly none — is a different application:
  // store the token, blank the screen, reconnect.
  const become = (next: string | null): void => {
    if (next === null) env.tokens.clear();
    else env.tokens.save(next);
    token = next;
    clearTimeout(retry);
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
    status: () => status,
    dispatch: (canvasId, event) => send({ type: 'event', canvas: canvasId, event: event as unknown as Record<string, unknown> }),
    publish: (channel, payload) => send(payload === undefined ? { type: 'publish', channel } : { type: 'publish', channel, payload }),
    reset: () => {
      if (disposed) return;
      // Open: ask the server, and the fresh frame arrives on this same socket.
      // Asked of our OWN status rather than `readyState`, because the socket
      // is whatever the host env constructed and the status is ours.
      if (socket !== null && status === 'open') {
        send({ type: 'reset' });
        return;
      }
      // Not open: the backoff may have us waiting half a minute for a retry,
      // and somebody pressing reset is telling us they are waiting NOW. Jump
      // the queue — reattaching re-sends the current trees anyway.
      clearTimeout(retry);
      attempts = 0;
      connect();
    },
    dispose: () => {
      disposed = true;
      status = 'closed'; // sync truth for late readers; no notification after dispose
      clearTimeout(retry);
      socket?.close();
    },
  };
};

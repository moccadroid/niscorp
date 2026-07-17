import type { NovaEvent, RenderNode } from '@niscorp/nova';
import { CLOSE_SIGNED_OUT } from './socket';

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
    ws.onmessage = (e) => {
      const message = JSON.parse(String(e.data)) as { type: string; canvas?: string; tree?: RenderNode[]; token?: string };
      if (message.type === 'render' && message.canvas !== undefined && message.tree !== undefined) {
        publishSnapshot({ ...snapshot, trees: new Map(snapshot.trees).set(message.canvas, message.tree) });
      } else if (message.type === 'frame' && message.tree !== undefined) {
        publishSnapshot({ ...snapshot, frame: message.tree });
      } else if (message.type === 'session' && typeof message.token === 'string') {
        // Login redeemed server-side: become that principal.
        become(message.token);
      }
    };
    // The socket is ephemeral, the shell is durable: reconnect re-sends
    // current state. The one deliberate close is SIGNED_OUT — drop the
    // token and become anonymous (the served lock screen).
    ws.onclose = (e) => {
      if (e.code === CLOSE_SIGNED_OUT) {
        become(null);
        return;
      }
      if (!disposed) retry = window.setTimeout(connect, 1000);
    };
  };

  // A different principal — possibly none — is a different application:
  // store the token, blank the screen, reconnect.
  const become = (next: string | null): void => {
    writeToken(next);
    token = next;
    window.clearTimeout(retry);
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

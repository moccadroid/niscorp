import type { NovaEvent, RenderNode } from '@niscorp/nova';
import { CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SIGNED_OUT, PROTOCOL, PROTOCOL_MIN, offerToken } from '../socket';
import { applyDelta, frameHash } from '../delta';
import type { DeltaOp } from '../delta';
import { heldCookieName } from '../session-cookie';

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
  // A host whose BROWSER may keep the session itself, in a cookie the page
  // cannot read (../session-cookie.ts): whether it does, right now. Asked
  // after an upgrade is answered — if it does, the wire lets go of the token
  // it offered and nothing is stored; if not, the token is stored as ever. A
  // host without this (a process) always keeps its own.
  held?: () => boolean;
  // Which of the browser's sessions this terminal is, when not the default one
  // — a seat. Named in the socket's address; it is the cookie's name.
  key?: string;
};

// The host seam: what the wire would otherwise take from globals.
export type WireEnv = {
  tokens: WireTokenStore;
  // Construct a socket for this url, offering these subprotocols —
  // `new WebSocket(url, offered)` in every host. What is offered is who the
  // terminal is (socket.ts): a host that drops it connects as nobody.
  socket: (upgrade: { url: string; offered: string[] }) => WebSocket;
  // the socket url when `config.url` is absent
  defaultUrl: () => string;
};

export type WireConfig = {
  // The socket url; default: `env.defaultUrl()`.
  url?: string;
  // The host environment; default: `browserEnv()`.
  env?: WireEnv;
  // Accept canvas frames as DELTAS against the last frame received (default:
  // off). Both ends have to want it: this tells the server the terminal can
  // rebuild them, and the server sends them only if `runtime.shellFrameDelta`
  // is on and the delta is decisively smaller. Nothing else about the terminal
  // changes — the snapshot it renders is identical either way. See DOCS.md
  // § Frame deltas.
  delta?: boolean;
  // The screen the page already shows — the snapshot a server-rendered
  // document carries (`readDocumentSnapshot`). The wire starts from it instead
  // of from nothing, so the first render matches the HTML and the first frames
  // off the socket confirm it rather than paint it. Absent, or made for
  // somebody else (see `DocumentSnapshot.principal`): the wire starts empty, as
  // it always has.
  initial?: DocumentSnapshot;
  // The path this terminal is on, named on the socket so the server can tell a
  // page's terminal from the app's (a page is served a shell of its own, for
  // this connection alone). Default: the path the page's snapshot was drawn
  // for; a page that was not drawn on the server passes `location.pathname`.
  path?: string;
};

// What a server-rendered document carries beside its HTML.
export type DocumentSnapshot = {
  frame: RenderNode[];
  trees: Record<string, RenderNode[]>;
  // The id seed an anonymous page's shell was built under; named on the first
  // connect so the socket's shell mints the same instance ids.
  seed?: string;
  // Whether the page was rendered for a signed-in principal. A page rendered
  // for nobody is not this terminal's screen if it holds a token, and the other
  // way round — the wire then starts empty rather than from the wrong screen.
  principal: boolean;
  // The path it was drawn for.
  path?: string;
  // False when nothing on the drawn screen can still happen: the trees are the
  // whole of it, and the wire opens no socket at all (status `static`). Absent
  // is live — a page that does not say is not concluded finished.
  live?: boolean;
};

// The id of the element a document carries its snapshot in.
export const SNAPSHOT_ELEMENT_ID = 'nisc-snapshot';

// Read the snapshot out of the page, if it has one. Never throws: a page
// without one, or with one that does not parse, is a page that was not
// server-rendered, and the terminal starts the way it always has.
export const readDocumentSnapshot = (doc: Pick<Document, 'getElementById'> = document): DocumentSnapshot | undefined => {
  try {
    const text = doc.getElementById(SNAPSHOT_ELEMENT_ID)?.textContent;
    if (text === undefined || text === null || text === '') return undefined;
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const { frame, trees, seed, principal, path, live } = parsed as Record<string, unknown>;
    if (!Array.isArray(frame) || trees === null || typeof trees !== 'object' || typeof principal !== 'boolean') return undefined;
    return {
      frame: frame as RenderNode[],
      trees: trees as Record<string, RenderNode[]>,
      principal,
      ...(typeof seed === 'string' ? { seed } : {}),
      ...(typeof path === 'string' ? { path } : {}),
      ...(typeof live === 'boolean' ? { live } : {}),
    };
  } catch {
    return undefined;
  }
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
// `incompatible`: this terminal and the server speak protocols the other
// cannot (see PROTOCOL in ../socket). Terminal state — the wire stops retrying,
// because every retry would speak the same protocol again.
// `static`: the page was drawn on the server and nothing on it can still
// happen, so no socket was opened. Not a fault and not a wait — `reset` (or a
// token arriving) connects after all.
export type WireStatus = 'connecting' | 'open' | 'closed' | 'incompatible' | 'static';

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
  // Undo the shell's last navigation. Fire-and-forget by design: what comes
  // back is whatever canvases moved, over the same stream every other change
  // arrives on — the terminal never holds a location to keep in step.
  back: () => void;
  // Jump to an ancestor already on a canvas's stack — one message the shell
  // executes atomically, rather than N back gestures racing each other.
  popTo: (canvas: string, instance: string) => void;
  dispose: () => void;
};

type ClientMessage =
  | { type: 'event'; canvas: string; event: Record<string, unknown> }
  | { type: 'publish'; channel: string; payload?: unknown }
  | { type: 'resync' }
  | { type: 'reset' }
  | { type: 'back' }
  | { type: 'popTo'; canvas: string; instance: string };

const EMPTY: WireSnapshot = { frame: [], trees: new Map() };

// The browser host: url derived from location, the page's WebSocket, and the
// session wherever this page can have it kept.
//
// SERVED BY THE APP IT TALKS TO, the page does not keep it: the browser does,
// in a cookie the page cannot read, which the server writes in its answer to
// the upgrade (../session-cookie.ts). `held` is all the page sees of it. A
// token this page is handed is offered once and let go of; nothing is stored.
//
// ANYWHERE ELSE — another origin, a browser that refuses cookies — the token
// is in localStorage, as it always was. The try/catches keep a storage-less
// context (private mode, sandboxed iframe) alive: the session then lives for
// this page only.
//
// `cookie` did one thing — keep a script-readable copy of the token for the
// server to draw the page from — and is no longer needed: the page is drawn
// from the browser's own cookie. It is accepted and does nothing.
export const browserEnv = (config: { tokenKey?: string; cookie?: boolean } = {}): WireEnv => {
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
        // the copy an earlier build kept beside it, where script could read it
        try {
          document.cookie = `${encodeURIComponent(tokenKey)}=; Path=/; Max-Age=0; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
        } catch {
          /* no document, or cookies refused */
        }
      },
      held: () => {
        try {
          return document.cookie.split('; ').includes(`${heldCookieName(tokenKey, window.location.port)}=1`);
        } catch {
          return false;
        }
      },
      ...(config.tokenKey !== undefined ? { key: tokenKey } : {}),
    },
    socket: ({ url, offered }) => new WebSocket(url, offered),
    defaultUrl: () => {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${scheme}://${window.location.host}/socket`;
    },
  };
};

export const createWire = (config: WireConfig = {}): Wire => {
  const env = config.env ?? browserEnv();

  let token = env.tokens.load();
  // The page's own snapshot, when it was rendered for who this terminal is —
  // signed in (holding a token, or its browser a session), or neither.
  // Anything else is somebody else's screen and is not started from.
  const initial = config.initial !== undefined && config.initial.principal === (token !== null || env.tokens.held?.() === true) ? config.initial : undefined;
  let snapshot: WireSnapshot = initial === undefined ? EMPTY : { frame: initial.frame, trees: new Map(Object.entries(initial.trees)) };
  // Named on the FIRST connect only: it belongs to the page's own shell, and a
  // later connect (a retry, another principal) is not that shell.
  let seed = initial?.seed;
  const path = config.path ?? config.initial?.path;
  let status: WireStatus = 'connecting';
  // Set by a protocol mismatch in either direction; ends the reconnect loop.
  let incompatible = false;
  // Signed out, and not yet heard by the server: the next upgrade says so,
  // because what the browser holds may be a token that still resolves.
  let leaving = false;
  // A sign-in handed to this terminal SEALED: its browser keeps the session,
  // so the page is given something it can carry to the next upgrade and cannot
  // open. Offered until an upgrade is answered. `unsealed`: this browser turned
  // out not to keep the cookie that opens one, so the terminal stops asking.
  let sealed: string | null = null;
  let unsealed = false;
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

  // Only on an OPEN socket, and never queued — the posture `back` and `popTo`
  // always had, now everybody's. A page rendered server-side is on screen
  // before the socket is, so there is a moment in which something can be
  // pressed with nothing to send it over: that press is dropped, not held. An
  // intention replayed against a screen that may have moved is worse than one
  // lost, and a browser socket that is still connecting throws on `send`.
  const send = (message: ClientMessage): void => {
    if (socket === null || status !== 'open') return;
    socket.send(JSON.stringify(message));
  };

  // The last `render` message TEXT per canvas — the base a delta is written
  // against, byte for byte as the server holds it. Only populated when deltas
  // are on; cleared on every connect, because attaching serves whole frames and
  // a base carried across a reconnect is a base the server never assumed.
  const bases = new Map<string, string>();

  const connect = (): void => {
    if (disposed) return;
    setStatus('connecting');
    bases.clear();
    // The address says nothing about who this is — it is what every proxy on
    // the way writes down. The token is offered with the socket, below.
    const params: string[] = [`protocol=${PROTOCOL}`];
    if (env.tokens.key !== undefined) params.push(`key=${encodeURIComponent(env.tokens.key)}`);
    if (leaving) params.push('leave=1');
    if (env.tokens.held !== undefined && !unsealed) params.push('sealed=1');
    if (config.delta === true) params.push('delta=1');
    if (seed !== undefined) params.push(`seed=${encodeURIComponent(seed)}`);
    seed = undefined;
    if (path !== undefined) params.push(`path=${encodeURIComponent(path)}`);
    const ws = env.socket({ url: `${url()}?${params.join('&')}`, offered: offerToken(token, sealed) });
    socket = ws;
    // A connection that opens is a healthy connection: forget the backoff.
    ws.onopen = () => {
      attempts = 0;
      setStatus('open');
    };
    ws.onmessage = (e) => {
      const text = String(e.data);
      const data = JSON.parse(text) as {
        type: string;
        canvas?: string;
        tree?: RenderNode[];
        ops?: DeltaOp[];
        hash?: number;
        protocol?: number;
        token?: string;
        sealed?: string;
        code?: string;
        message?: string;
      };
      if (data.type === 'render' && data.canvas !== undefined && data.tree !== undefined) {
        if (config.delta === true) bases.set(data.canvas, text);
        publishSnapshot({ ...snapshot, trees: new Map(snapshot.trees).set(data.canvas, data.tree) });
      } else if (data.type === 'render-delta' && data.canvas !== undefined && data.ops !== undefined && data.hash !== undefined) {
        // Rebuild, then PROVE it. Anything short of the server's own checksum
        // and we would be rendering a frame nobody authored — so every failure
        // here takes the one exit that always works: ask for whole frames.
        // Never a thrown error and never a partial apply; a terminal that goes
        // blank on a bad delta is worse than one that costs a round trip.
        const base = bases.get(data.canvas);
        let rebuilt: string | null = null;
        if (base !== undefined) {
          try {
            const candidate = applyDelta(base, data.ops);
            rebuilt = frameHash(candidate) === data.hash ? candidate : null;
          } catch {
            rebuilt = null;
          }
        }
        if (rebuilt === null) {
          console.warn(`[moss/wire] canvas "${data.canvas}": delta did not rebuild the server's frame — resyncing.`);
          bases.delete(data.canvas);
          send({ type: 'resync' });
          return;
        }
        const frame = JSON.parse(rebuilt) as { canvas: string; tree: RenderNode[] };
        bases.set(data.canvas, rebuilt);
        publishSnapshot({ ...snapshot, trees: new Map(snapshot.trees).set(data.canvas, frame.tree) });
      } else if (data.type === 'frame' && data.tree !== undefined) {
        publishSnapshot({ ...snapshot, frame: data.tree });
      } else if (data.type === 'session' && typeof data.token === 'string') {
        // Login redeemed server-side: become that principal.
        become(data.token);
      } else if (data.type === 'session' && typeof data.sealed === 'string') {
        // The same, for a terminal whose browser keeps the session: nothing
        // this page can read — it is carried to the next upgrade as it is.
        become(null, data.sealed);
      } else if (data.type === 'error') {
        if (data.code === 'seal_not_kept') unsealed = true;
        // Diagnostics, not authority — surfaced, never swallowed: a wire that
        // silently stops updating is the worst thing to debug. `invalid_token`
        // arrives here too, from the server's revalidation pass, and it is
        // worth the line: the AUTHORITY is the 4401 close that follows (see
        // onclose), and this is the breadcrumb saying the session expired
        // rather than the network dropping.
        console.warn(`[moss/wire] server error${data.code !== undefined ? ` (${data.code})` : ''}: ${data.message ?? ''}`);
      } else if (data.type === 'hello' && (data.protocol ?? 1) < PROTOCOL_MIN) {
        // The other half of the handshake: the server checked this terminal on
        // the upgrade; this checks the server. One that predates the question
        // sends no `protocol` and speaks 1.
        console.error(`[moss/wire] the server speaks protocol ${data.protocol ?? 1}; this terminal needs ${PROTOCOL_MIN}–${PROTOCOL}. The server has not been updated yet.`);
        incompatible = true;
        ws.close();
      } else if (data.type === 'hello') {
        // The upgrade has been answered, so a browser that keeps the session
        // itself now does: the token this terminal offered is let go of, and
        // the page holds it no longer. One that does not (another origin,
        // cookies refused) leaves it with the terminal, stored as it always was.
        leaving = false;
        sealed = null;
        if (token !== null && env.tokens.held !== undefined) {
          if (env.tokens.held()) {
            env.tokens.clear();
            token = null;
          } else env.tokens.save(token);
        }
      } else if (data.type !== 'catalog') {
        // catalog is known and deliberately ignored (the terminal is
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
      if (incompatible || e.code === CLOSE_PROTOCOL_MISMATCH) {
        incompatible = true;
        setStatus('incompatible');
        return;
      }
      setStatus('closed');
      if (e.code === CLOSE_SIGNED_OUT || e.code === CLOSE_INVALID_TOKEN) {
        leaving = e.code === CLOSE_SIGNED_OUT;
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
  // store the token, blank the screen, reconnect. A host whose browser may
  // keep the session stores nothing yet: the token is offered, and what
  // becomes of it is settled when the upgrade is answered (`hello`, above).
  const become = (next: string | null, handedSealed: string | null = null): void => {
    if (handedSealed !== null) sealed = handedSealed;
    else if (next === null) env.tokens.clear();
    else if (env.tokens.held === undefined) env.tokens.save(next);
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

  // A drawn page with nothing left to happen needs no socket. Everything that
  // would later need one — `reset`, a token arriving — connects by itself.
  if (initial?.live === false) status = 'static';
  else connect();

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
    status: () => status,
    dispatch: (canvasId, event) => send({ type: 'event', canvas: canvasId, event: event as unknown as Record<string, unknown> }),
    publish: (channel, payload) => send(payload === undefined ? { type: 'publish', channel } : { type: 'publish', channel, payload }),
    // Only on an open socket, and deliberately not queued: a back pressed while
    // the connection is down is a gesture about a screen the person is no
    // longer being served, and replaying it on reconnect would move them
    // somewhere they asked to go some seconds and one outage ago.
    back: () => {
      if (socket === null || status !== 'open') return;
      send({ type: 'back' });
    },
    // Same posture as `back`: only on an open socket, never queued. A jump
    // replayed on reconnect would move somebody to where they wanted to be
    // one outage ago.
    popTo: (canvas: string, instance: string) => {
      if (socket === null || status !== 'open') return;
      send({ type: 'popTo', canvas, instance });
    },
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

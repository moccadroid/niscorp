import type { NovaEvent } from '@niscorp/nova';
import { CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SIGNED_OUT, PROTOCOL, PROTOCOL_MIN, ServerMessageSchema } from '../protocol';
import type { ClientMessage, DocumentSnapshot, ServerMessage } from '../protocol';
import { createCredential } from './credential';
import type { Credential } from './credential';
import { browserEnv } from './env';
import type { WireEnv } from './env';
import { createScreen } from './screen';
import type { Screen, WireSnapshot } from './screen';

// ═══════════════════════════════════════════════════════════════
// The wire — moss's protocol client, the other end of ../socket; what the
// two agree on is ../protocol, and that is all of moss this imports. Plain
// code: a websocket with reconnect, and session lifecycle — a `session`
// message (login redeemed server-side) stores the token and reconnects
// authenticated; a 4403 close clears it and reconnects anonymous (the lock
// screen is the anonymous principal's application, served like everything
// else). Rendering the snapshot is the app's (framework's) business; nothing
// framework-shaped lives here.
//
// Its parts: who the terminal is between connects (./credential.ts), what it
// holds of the screen (./screen.ts), and the host it runs in (./env.ts). This
// file is the connection: one socket, its status, and when to try again.
// ═══════════════════════════════════════════════════════════════

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
  // somebody else (see `DocumentSnapshot.principal`): the wire starts empty.
  initial?: DocumentSnapshot;
  // The path this terminal is on, named on the socket so the server can tell a
  // page's terminal from the app's (a page is served a shell of its own, for
  // this connection alone). Default: the path the page's snapshot was drawn
  // for; a page that was not drawn on the server passes `location.pathname`.
  path?: string;
};

// The socket's health, as a renderer needs it: `connecting` (a connect is in
// flight or scheduled), `open`, `closed` (lost; a retry will flip it back to
// connecting). Status changes notify subscribers like snapshot changes do —
// a terminal that renders nothing on a dead socket is indistinguishable from
// a working terminal rendering an empty app, so the state must be readable.
// `incompatible`: this terminal and the server speak protocols the other
// cannot (see PROTOCOL in ../protocol). Terminal state — the wire stops retrying,
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

// What the server sent, read as the protocol says it — or undefined, and said
// so: a wire that silently stops updating is the worst thing to debug. Only
// the message's type is named. Its text may carry a session token, and a
// console is read by more than the person sitting at it.
const messageOf = (text: string): ServerMessage | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    console.warn('[moss/wire] unreadable server message: not JSON');
    return undefined;
  }
  const read = ServerMessageSchema.safeParse(value);
  if (read.success) return read.data;
  const named = typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string' ? value.type : 'of no type';
  console.warn(`[moss/wire] unreadable server message: ${named}`);
  return undefined;
};

// What one connection's messages are handed to.
type Hearing = {
  screen: Screen;
  credential: Credential;
  send: (message: ClientMessage) => void;
  // become that principal: by a token, or by a sign-in handed over sealed
  become: (token: string | null, sealed?: string | null) => void;
  // the server served this connection a screen
  served: () => void;
  // the server speaks a protocol this terminal cannot: end the connection, for good
  refuse: () => void;
};

// One message off the socket, routed.
const hear = (to: Hearing, text: string): void => {
  const data = messageOf(text);
  if (data === undefined) return;
  switch (data.type) {
    case 'render':
      to.screen.render(data.canvas, data.tree, text);
      return;
    case 'render-delta':
      // A delta that does not rebuild the server's frame takes the one exit
      // that always works: ask for whole frames.
      if (to.screen.renderDelta(data.canvas, data.ops, data.hash)) return;
      console.warn(`[moss/wire] canvas "${data.canvas}": delta did not rebuild the server's frame — resyncing.`);
      to.send({ type: 'resync' });
      return;
    case 'frame':
      to.screen.frame(data.tree);
      to.served();
      return;
    case 'session':
      // Login redeemed server-side: become that principal. Handed over
      // sealed, for a terminal whose browser keeps the session, it is
      // nothing this page can read — it is carried to the next upgrade as
      // it is.
      if ('token' in data) to.become(data.token);
      else to.become(null, data.sealed);
      return;
    case 'error':
      if (data.code === 'seal_not_kept') to.credential.sealNotKept();
      // Diagnostics, not authority — surfaced, never swallowed: a wire that
      // silently stops updating is the worst thing to debug. `invalid_token`
      // arrives here too, from the server's revalidation pass, and it is
      // worth the line: the AUTHORITY is the 4401 close that follows, and
      // this is the breadcrumb saying the session expired rather than the
      // network dropping.
      console.warn(`[moss/wire] server error (${data.code}): ${data.message}`);
      return;
    case 'hello':
      // The other half of the handshake: the server checked this terminal on
      // the upgrade; this checks the server. One that predates the question
      // sends no `protocol`, which the protocol reads as 1.
      if (data.protocol < PROTOCOL_MIN) {
        console.error(`[moss/wire] the server speaks protocol ${data.protocol}; this terminal needs ${PROTOCOL_MIN}–${PROTOCOL}. The server has not been updated yet.`);
        to.refuse();
        return;
      }
      to.credential.answered();
      return;
    case 'catalog':
      // Known and deliberately ignored: the terminal is grant-blind — it
      // renders what it is served, never what it may do.
      return;
    default:
      // A message the protocol gains and this does not handle fails to compile.
      data satisfies never;
  }
};

// When to try again after a connection is lost. Exponential backoff with
// jitter, capped: a dead server is polled ever more slowly (never faster than
// ~½s, never slower than the cap), and the jitter spreads a thundering herd of
// terminals reconnecting on the same outage.
const RECONNECT_CAP_MS = 30_000;
const createRetry = (connect: () => void): { schedule: () => void; forget: () => void } => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Consecutive failed connects. Drives the backoff, so a dead server is not
  // polled every second forever.
  let attempts = 0;
  return {
    schedule: () => {
      const ceiling = Math.min(RECONNECT_CAP_MS, 1000 * 2 ** attempts);
      attempts += 1;
      timer = setTimeout(connect, ceiling / 2 + Math.random() * (ceiling / 2));
    },
    // Nothing scheduled, and the backoff clean: a connection that was served
    // a screen is a healthy one, a new principal is a fresh session, and
    // somebody pressing reset is waiting now.
    forget: () => {
      clearTimeout(timer);
      attempts = 0;
    },
  };
};

// A socket the wire is done with: no longer listened to, and closed.
const letGoOf = (socket: WebSocket | null): void => {
  if (socket === null) return;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.close();
};

// The socket's address. It says nothing about who this is — it is what every
// proxy on the way writes down. The token is offered with the socket.
const addressOf = (url: string, said: { credential: Credential; delta: boolean; seed: string | undefined; path: string | undefined }): string => {
  const params = [`protocol=${PROTOCOL}`, ...said.credential.params()];
  if (said.delta) params.push('delta=1');
  if (said.seed !== undefined) params.push(`seed=${encodeURIComponent(said.seed)}`);
  if (said.path !== undefined) params.push(`path=${encodeURIComponent(said.path)}`);
  return `${url}?${params.join('&')}`;
};

// What a connection is made from: the wire's settings, the host it runs in,
// who the terminal is between connects, the screen its messages are written
// to, the page's own snapshot when the wire starts from one, and whom to tell
// when its status changes.
type ConnectionDeps = {
  config: WireConfig;
  env: WireEnv;
  credential: Credential;
  screen: Screen;
  delta: boolean;
  initial: DocumentSnapshot | undefined;
  notify: () => void;
};

// THE CONNECTION: one socket at a time, its status, and when to try again.
// What a wire's own members are made of.
type Connection = Pick<Wire, 'status' | 'reset' | 'dispose'> & { send: (message: ClientMessage) => void };

const createConnection = ({ config, env, credential, screen, delta, initial, notify }: ConnectionDeps): Connection => {
  // Named on the FIRST connect only: it belongs to the page's own shell, and a
  // later connect (a retry, another principal) is not that shell.
  let seed = initial?.seed;
  const path = config.path ?? config.initial?.path;
  let status: WireStatus = 'connecting';
  // Set by a protocol mismatch in either direction; ends the reconnect loop.
  let incompatible = false;
  let socket: WebSocket | null = null;
  let disposed = false;
  const setStatus = (next: WireStatus): void => {
    if (status === next) return;
    status = next;
    notify();
  };

  // Only on an OPEN socket, and never queued. A page rendered server-side is
  // on screen before the socket is, so there is a moment in which something
  // can be pressed with nothing to send it over: that press is dropped, not
  // held. An intention replayed against a screen that may have moved is worse
  // than one lost — a back or a jump replayed on reconnect would move somebody
  // to where they wanted to be one outage ago — and a browser socket that is
  // still connecting throws on `send`.
  const send = (message: ClientMessage): void => {
    if (socket === null || status !== 'open') return;
    socket.send(JSON.stringify(message));
  };

  // ONE SOCKET AT A TIME. Whatever socket there was is let go of before
  // another is made. It may be one that has closed, one that carried another
  // principal, or one whose connect was still in flight when somebody pressed
  // reset — left listened to, that one would open beside its replacement, and
  // two sockets would write one snapshot.
  const connect = (): void => {
    if (disposed) return;
    letGoOf(socket);
    socket = null;
    // Whether the two ends can speak is found out per connection: the one
    // being made may reach a server that has been updated since.
    incompatible = false;
    setStatus('connecting');
    screen.forgetBases();
    const ws = env.socket({ url: addressOf(config.url ?? env.defaultUrl(), { credential, delta, seed, path }), offered: credential.offered() });
    seed = undefined;
    socket = ws;
    const refuse = (): void => {
      incompatible = true;
      ws.close();
    };
    // A CONNECTION THAT WAS SERVED A SCREEN IS A HEALTHY ONE, and that is when
    // the backoff is forgotten: at its first frame, which is the first thing
    // a shell sends whatever attaches to it. NOT WHEN THE SOCKET OPENS. A
    // server that refuses a connection opens it first, because a refusal is a
    // message and a close code: no place left for a shell for nobody
    // (`4503`), a session it could not open (`4500`). Forgotten at the open,
    // every refusal would be followed by a connect half a second to a second
    // later, for as long as the server went on refusing.
    const hearing: Hearing = { screen, credential, send, become, refuse, served: retry.forget };
    ws.onopen = () => setStatus('open');
    ws.onmessage = (e) => hear(hearing, String(e.data));
    ws.onclose = (e) => closed(e.code);
  };
  const retry = createRetry(connect);

  // The socket is ephemeral, the shell is durable: reconnect re-sends
  // current state. Two application close codes are recoveries, not retries —
  // SIGNED_OUT (a deliberate revoke) and INVALID_TOKEN (the stored token went
  // stale; retrying WITH it would loop forever) both drop the token and
  // reconnect anonymous (the served lock screen). Every other close backs off
  // and retries carrying the current token.
  const closed = (code: number): void => {
    if (incompatible || code === CLOSE_PROTOCOL_MISMATCH) {
      incompatible = true;
      setStatus('incompatible');
      return;
    }
    setStatus('closed');
    if (code === CLOSE_SIGNED_OUT || code === CLOSE_INVALID_TOKEN) {
      credential.leave(code === CLOSE_SIGNED_OUT);
      become(null);
      return;
    }
    if (!disposed) retry.schedule();
  };

  // A different principal — possibly none — is a different application:
  // blank the screen, reconnect.
  const become = (token: string | null, sealed: string | null = null): void => {
    credential.become(token, sealed);
    retry.forget();
    screen.blank();
    connect();
  };

  // A drawn page with nothing left to happen needs no socket. Everything that
  // would later need one — `reset`, a token arriving — connects by itself.
  if (initial?.live === false) status = 'static';
  else connect();

  return {
    send,
    status: () => status,
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
      retry.forget();
      connect();
    },
    dispose: () => {
      disposed = true;
      status = 'closed'; // sync truth for late readers; no notification after dispose
      retry.forget();
      socket?.close();
    },
  };
};

export const createWire = (config: WireConfig = {}): Wire => {
  const env = config.env ?? browserEnv();
  const credential = createCredential(env.tokens);
  // The page's own snapshot, when it was rendered for who this terminal is —
  // signed in (holding a token, or its browser a session), or neither.
  // Anything else is somebody else's screen and is not started from.
  const initial = config.initial !== undefined && config.initial.principal === credential.signedIn() ? config.initial : undefined;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const delta = config.delta === true;
  const screen = createScreen({ initial, delta, changed: notify });
  const { send, status, reset, dispose } = createConnection({ config, env, credential, screen, delta, initial, notify });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: screen.snapshot,
    status,
    dispatch: (canvasId, event) => send({ type: 'event', canvas: canvasId, event }),
    publish: (channel, payload) => send(payload === undefined ? { type: 'publish', channel } : { type: 'publish', channel, payload }),
    back: () => send({ type: 'back' }),
    popTo: (canvas, instance) => send({ type: 'popTo', canvas, instance }),
    reset,
    dispose,
  };
};

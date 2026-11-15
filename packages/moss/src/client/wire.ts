import type { NovaEvent } from '@niscorp/nova';
import { CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SIGNED_OUT, PROTOCOL, PROTOCOL_MIN, ServerMessageSchema, offerToken } from '../protocol';
import type { ClientMessage, DocumentSnapshot, ServerMessage } from '../protocol';
import { browserEnv } from './env';
import type { WireEnv, WireTokenStore } from './env';
import { createKeptEvents } from './kept';
import type { KeptEvents } from './kept';
import { createScreen } from './screen';
import type { Screen, WireSnapshot } from './screen';

type Credential = {
  signedIn: () => boolean;
  params: () => string[];
  offered: () => string[];
  upgradeAnswered: () => void;
  become: (token: string | null, sealed: string | null) => void;
  setLeaving: (leaving: boolean) => void;
  sealNotKept: () => void;
};

const createCredential = (tokens: WireTokenStore): Credential => {
  let token = tokens.load();
  let leaving = false;
  let sealed: string | null = null;
  let sealUnavailable = false;
  return {
    signedIn: () => token !== null || tokens.held?.() === true,
    params: () => [
      ...(tokens.key !== undefined ? [`key=${encodeURIComponent(tokens.key)}`] : []),
      ...(leaving ? ['leave=1'] : []),
      ...(tokens.held !== undefined && !sealUnavailable ? ['sealed=1'] : []),
    ],
    offered: () => offerToken(token, sealed),
    // A browser that keeps the session itself holds it once the upgrade is answered, and the token
    // is let go of. One that does not (another origin, cookies refused) has it stored.
    upgradeAnswered: () => {
      leaving = false;
      sealed = null;
      if (token === null || tokens.held === undefined) return;
      if (tokens.held()) {
        tokens.clear();
        token = null;
      } else tokens.save(token);
    },
    become: (next, handedSealed) => {
      sealed = handedSealed;
      if (handedSealed !== null) {
        // Sealed: nothing this page can read, so nothing is stored.
      } else if (next === null) tokens.clear();
      else if (tokens.held === undefined) tokens.save(next);
      token = next;
    },
    setLeaving: (next) => {
      leaving = next;
    },
    sealNotKept: () => {
      sealUnavailable = true;
    },
  };
};

export type WireConfig = {
  url?: string;
  env?: WireEnv;
  delta?: boolean;
  initial?: DocumentSnapshot;
  path?: string;
};

export type WireStatus = 'connecting' | 'open' | 'closed' | 'incompatible' | 'static';

export type Wire = {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => WireSnapshot;
  status: () => WireStatus;
  // Optional: a wire an app makes itself (a stand-in in a check) need not count.
  droppedEvents?: () => number;
  dispatch: (canvasId: string, event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;
  reset: () => void;
  back: () => void;
  popTo: (canvas: string, instance: string) => void;
  dispose: () => void;
};

const messageOf = (text: string): ServerMessage | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    console.warn('[moss/wire] unreadable server message: not JSON');
    return undefined;
  }
  const parsed = ServerMessageSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const named = typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string' ? value.type : 'of no type';
  // Only the type is named: the text may carry a session token.
  console.warn(`[moss/wire] unreadable server message: ${named}`);
  return undefined;
};

type Hearing = {
  screen: Screen;
  kept: KeptEvents;
  credential: Credential;
  send: (message: ClientMessage) => void;
  become: (token: string | null, sealed?: string | null) => void;
  served: () => void;
  refuse: () => void;
};

const hear = (to: Hearing, text: string): void => {
  const data = messageOf(text);
  if (data === undefined) return;
  switch (data.type) {
    case 'render':
      to.screen.render(data.canvas, data.tree, text);
      to.kept.arrived(data.canvas);
      return;
    case 'render-delta':
      if (to.screen.renderDelta(data.canvas, data.ops, data.hash)) {
        to.kept.arrived(data.canvas);
        return;
      }
      console.warn(`[moss/wire] canvas "${data.canvas}": delta did not rebuild the server's frame — resyncing.`);
      to.send({ type: 'resync' });
      return;
    case 'frame':
      to.screen.frame(data.tree, text);
      to.served();
      return;
    case 'session':
      if ('token' in data) to.become(data.token);
      else to.become(null, data.sealed);
      return;
    case 'error':
      if (data.code === 'seal_not_kept') to.credential.sealNotKept();
      console.warn(`[moss/wire] server error (${data.code}): ${data.message}`);
      return;
    case 'hello':
      if (data.protocol < PROTOCOL_MIN) {
        console.error(`[moss/wire] the server speaks protocol ${data.protocol}; this terminal needs ${PROTOCOL_MIN}–${PROTOCOL}. The server has not been updated yet.`);
        to.refuse();
        return;
      }
      to.credential.upgradeAnswered();
      return;
    case 'catalog':
    case 'pong':
      return;
    default:
      data satisfies never;
  }
};

const RECONNECT_CAP_MS = 30_000;
const createRetry = (connect: () => void): { schedule: () => void; forget: () => void } => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  return {
    schedule: () => {
      const ceiling = Math.min(RECONNECT_CAP_MS, 1000 * 2 ** attempts);
      attempts += 1;
      timer = setTimeout(connect, ceiling / 2 + Math.random() * (ceiling / 2));
    },
    forget: () => {
      clearTimeout(timer);
      attempts = 0;
    },
  };
};

const letGoOf = (socket: WebSocket | null): void => {
  if (socket === null) return;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.close();
};

const addressOf = (url: string, said: { credential: Credential; delta: boolean; seed: string | undefined; path: string | undefined }): string => {
  const params = [`protocol=${PROTOCOL}`, ...said.credential.params()];
  if (said.delta) params.push('delta=1');
  if (said.seed !== undefined) params.push(`seed=${encodeURIComponent(said.seed)}`);
  if (said.path !== undefined) params.push(`path=${encodeURIComponent(said.path)}`);
  return `${url}?${params.join('&')}`;
};

type ConnectionDeps = {
  config: WireConfig;
  env: WireEnv;
  credential: Credential;
  screen: Screen;
  delta: boolean;
  initial: DocumentSnapshot | undefined;
  notify: () => void;
};

type Connection = Pick<Wire, 'status' | 'reset' | 'dispose' | 'dispatch'> & { droppedEvents: () => number; send: (message: ClientMessage) => void };

const CHECK_MS = 2000;
// Below the 30–60 s after which proxies and NATs commonly drop a connection that says nothing.
const QUIET_MS = 25_000;
// Nothing waits on a ping's answer, so it is given long enough to spare a socket that works on a slow link.
const PING_ANSWER_MS = 10_000;

const createConnection = ({ config, env, credential, screen, delta, initial, notify }: ConnectionDeps): Connection => {
  // Named on the first connect only: a later one (a retry, another principal) is not the page's own shell.
  let seed = initial?.seed;
  const path = config.path ?? config.initial?.path;
  let status: WireStatus = 'connecting';
  let incompatible = false;
  let socket: WebSocket | null = null;
  let disposed = false;
  let checking: ReturnType<typeof setTimeout> | undefined;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let pinged: ReturnType<typeof setTimeout> | undefined;
  const setStatus = (next: WireStatus): void => {
    if (status === next) return;
    status = next;
    notify();
  };

  // A check keeps the status open: it is over in a round trip on a live socket, and saying otherwise
  // would flicker every target on every return to the page.
  const live = (): boolean => socket !== null && status === 'open' && checking === undefined;
  // `back`, `popTo` and `publish` name no canvas to check a replay against: dropped unless live.
  const send = (message: ClientMessage): void => {
    if (socket === null || !live()) return;
    socket.send(JSON.stringify(message));
  };
  const kept = createKeptEvents({
    treeOf: (canvas) => screen.snapshot().trees.get(canvas),
    open: live,
    send: (canvas, event) => send({ type: 'event', canvas, event }),
    changed: notify,
  });

  const stopCheck = (): void => {
    clearTimeout(checking);
    checking = undefined;
  };
  const stopTimers = (): void => {
    stopCheck();
    clearTimeout(quiet);
    clearTimeout(pinged);
    pinged = undefined;
  };
  const opened = (): void => {
    stopCheck();
    setStatus('open');
    kept.judge();
  };

  const connect = (): void => {
    if (disposed) return;
    // One socket at a time: one still connecting when reset was pressed would otherwise open beside
    // its replacement, and two sockets would write one snapshot.
    letGoOf(socket);
    socket = null;
    incompatible = false;
    stopTimers();
    setStatus('connecting');
    screen.forgetBases();
    kept.fresh();
    const ws = env.socket({ url: addressOf(config.url ?? env.defaultUrl(), { credential, delta, seed, path }), offered: credential.offered() });
    seed = undefined;
    socket = ws;
    const refuse = (): void => {
      incompatible = true;
      ws.close();
    };
    // Open at the first frame, not at the open: the server sends it once it listens, and a server
    // that refuses a connection opens it first, so every refusal would be retried at once.
    const served = (): void => {
      retry.forget();
      opened();
    };
    const hearing: Hearing = { screen, kept, credential, send, become, refuse, served };
    ws.onmessage = (e) => {
      hear(hearing, String(e.data));
      if (socket !== ws || incompatible) return;
      clearTimeout(pinged);
      pinged = undefined;
      if (checking !== undefined) opened();
      heard();
    };
    ws.onclose = (e) => closed(e.code);
  };
  const retry = createRetry(connect);
  const replace = (): void => {
    retry.forget();
    connect();
  };

  // A socket may be dead and still read open. One that answers nothing in time is replaced.
  // A page coming back is sent the screen again, so what is kept meanwhile waits for it.
  const check = (): void => {
    if (socket === null) return;
    kept.fresh();
    socket.send(JSON.stringify({ type: 'resync' } satisfies ClientMessage));
    checking = setTimeout(() => {
      checking = undefined;
      replace();
    }, CHECK_MS);
  };
  // A quiet socket's screen is current: nothing is kept while its ping is answered.
  const ping = (): void => {
    if (socket === null) return;
    socket.send(JSON.stringify({ type: 'ping' } satisfies ClientMessage));
    pinged = setTimeout(() => {
      pinged = undefined;
      replace();
    }, PING_ANSWER_MS);
  };

  // A page that is hidden is not asked: it is checked when it comes back.
  const heard = (): void => {
    clearTimeout(quiet);
    quiet = setTimeout(() => {
      if (!live()) return;
      if (env.visible?.() === false) heard();
      else ping();
    }, QUIET_MS);
  };

  const resumed = (): void => {
    if (disposed) return;
    if (status === 'closed') {
      replace();
      return;
    }
    if (live()) check();
  };
  const stopResuming = env.onResume?.(resumed);

  const closed = (code: number): void => {
    const wasChecking = checking !== undefined || pinged !== undefined;
    stopTimers();
    if (incompatible || code === CLOSE_PROTOCOL_MISMATCH) {
      incompatible = true;
      setStatus('incompatible');
      return;
    }
    setStatus('closed');
    if (code === CLOSE_SIGNED_OUT || code === CLOSE_INVALID_TOKEN) {
      credential.setLeaving(code === CLOSE_SIGNED_OUT);
      become(null);
      return;
    }
    if (disposed) return;
    // The close a check or a ping was waiting to find out about: the page is up, so no backoff.
    if (wasChecking) replace();
    else retry.schedule();
  };

  const become = (token: string | null, sealed: string | null = null): void => {
    kept.drop();
    credential.become(token, sealed);
    retry.forget();
    screen.blank();
    connect();
  };

  if (initial?.live === false) status = 'static';
  else connect();

  return {
    send,
    status: () => status,
    droppedEvents: kept.dropped,
    dispatch: (canvas, event) => {
      if (disposed || status === 'static' || status === 'incompatible') return;
      if (!live()) {
        kept.keep(canvas, event);
        return;
      }
      // Pressed on the screen the person sees now: what was kept from before it is out of date.
      kept.drop();
      send({ type: 'event', canvas, event });
    },
    reset: () => {
      if (disposed) return;
      // During a check too: a dead socket loses it, and the check replaces the socket.
      if (socket !== null && status === 'open') {
        socket.send(JSON.stringify({ type: 'reset' } satisfies ClientMessage));
        return;
      }
      replace();
    },
    dispose: () => {
      disposed = true;
      // Set directly: nothing is notified after dispose.
      status = 'closed';
      retry.forget();
      stopTimers();
      kept.dispose();
      stopResuming?.();
      letGoOf(socket);
      socket = null;
    },
  };
};

export const createWire = (config: WireConfig = {}): Wire & { droppedEvents: () => number } => {
  const env = config.env ?? browserEnv();
  const credential = createCredential(env.tokens);
  const initial = config.initial !== undefined && config.initial.principal === credential.signedIn() ? config.initial : undefined;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const delta = config.delta === true;
  const screen = createScreen({ initial, delta, changed: notify });
  const { send, status, droppedEvents, dispatch, reset, dispose } = createConnection({ config, env, credential, screen, delta, initial, notify });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: screen.snapshot,
    status,
    droppedEvents,
    dispatch,
    publish: (channel, payload) => send(payload === undefined ? { type: 'publish', channel } : { type: 'publish', channel, payload }),
    back: () => send({ type: 'back' }),
    popTo: (canvas, instance) => send({ type: 'popTo', canvas, instance }),
    reset,
    dispose,
  };
};

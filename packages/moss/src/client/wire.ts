import type { NovaEvent } from '@niscorp/nova';
import { CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SIGNED_OUT, PROTOCOL, PROTOCOL_MIN, ServerMessageSchema, offerToken } from '../protocol';
import type { ClientMessage, DocumentSnapshot, ServerMessage } from '../protocol';
import { browserEnv } from './env';
import type { WireEnv, WireTokenStore } from './env';
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
      return;
    case 'render-delta':
      if (to.screen.renderDelta(data.canvas, data.ops, data.hash)) return;
      console.warn(`[moss/wire] canvas "${data.canvas}": delta did not rebuild the server's frame — resyncing.`);
      to.send({ type: 'resync' });
      return;
    case 'frame':
      to.screen.frame(data.tree);
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

type Connection = Pick<Wire, 'status' | 'reset' | 'dispose'> & { send: (message: ClientMessage) => void };

const createConnection = ({ config, env, credential, screen, delta, initial, notify }: ConnectionDeps): Connection => {
  // Named on the first connect only: a later one (a retry, another principal) is not the page's own shell.
  let seed = initial?.seed;
  const path = config.path ?? config.initial?.path;
  let status: WireStatus = 'connecting';
  let incompatible = false;
  let socket: WebSocket | null = null;
  let disposed = false;
  const setStatus = (next: WireStatus): void => {
    if (status === next) return;
    status = next;
    notify();
  };

  // Dropped unless the socket is open, never queued: an intention replayed against a screen that
  // has moved since is worse than one lost.
  const send = (message: ClientMessage): void => {
    if (socket === null || status !== 'open') return;
    socket.send(JSON.stringify(message));
  };

  const connect = (): void => {
    if (disposed) return;
    // One socket at a time: one still connecting when reset was pressed would otherwise open beside
    // its replacement, and two sockets would write one snapshot.
    letGoOf(socket);
    socket = null;
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
    // The backoff is forgotten at the first frame, not at the open: a server that refuses a
    // connection opens it first, and every refusal would be retried at once.
    const hearing: Hearing = { screen, credential, send, become, refuse, served: retry.forget };
    ws.onopen = () => setStatus('open');
    ws.onmessage = (e) => hear(hearing, String(e.data));
    ws.onclose = (e) => closed(e.code);
  };
  const retry = createRetry(connect);

  const closed = (code: number): void => {
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
    if (!disposed) retry.schedule();
  };

  const become = (token: string | null, sealed: string | null = null): void => {
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
    reset: () => {
      if (disposed) return;
      if (socket !== null && status === 'open') {
        send({ type: 'reset' });
        return;
      }
      retry.forget();
      connect();
    },
    dispose: () => {
      disposed = true;
      // Set directly: nothing is notified after dispose.
      status = 'closed';
      retry.forget();
      socket?.close();
    },
  };
};

export const createWire = (config: WireConfig = {}): Wire => {
  const env = config.env ?? browserEnv();
  const credential = createCredential(env.tokens);
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

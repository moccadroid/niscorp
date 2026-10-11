import { describe, it, expect, vi, afterEach } from 'vitest';
import { sessionCookies } from '../src/identity';
import { CLOSE_AT_CAPACITY, CLOSE_INVALID_TOKEN, PROTOCOL, ServerMessageSchema, offerToken } from '../src/protocol';
import type { ServerMessage } from '../src/protocol';
import type { NiscRuntime } from '../src/runtime';
import { buildSocket } from '../src/server/socket';
import type { Connection } from '../src/socket';

// THE SOCKET AS THE SERVER STANDS IT UP (../src/server/socket.ts): what the
// runtime says of it reaches it. The socket's own tests (socket.test.ts) hand
// `createSocket` its settings themselves; these hold the wiring that reads
// them off the runtime, so a deployment that sets a limit, its origins or its
// revalidation clock is not served the defaults.
//
// No server and no database: who a token is, is a map here, and a shell is an
// object that takes a connection.

const SOCKET = `/socket?protocol=${PROTOCOL}`;

// What a terminal was sent, and whether it was closed.
const terminal = (upgrade?: Connection['upgrade']): Connection & { sent: ServerMessage[]; closed: number[] } => {
  const sent: ServerMessage[] = [];
  const closed: number[] = [];
  return {
    sent,
    closed,
    send: (text) => void sent.push(ServerMessageSchema.parse(JSON.parse(text))),
    close: (code) => void closed.push(code ?? 1000),
    onMessage: () => undefined,
    onClose: () => undefined,
    ...(upgrade === undefined ? {} : { upgrade }),
  };
};
const helloOf = (connection: { sent: ServerMessage[] }): string | null | undefined => connection.sent.flatMap((message) => (message.type === 'hello' ? [message.principal] : []))[0];
const errorsOf = (connection: { sent: ServerMessage[] }): string[] => connection.sent.flatMap((message) => (message.type === 'error' ? [message.code] : []));

// The deployment's socket: `tokens` says who each token is, now.
const socketOf = (runtime: Partial<NiscRuntime>, tokens: Map<string, string> = new Map()) => {
  const session = { attach: () => undefined, detach: () => undefined, resync: () => undefined, dispatch: () => undefined, publish: () => undefined, reset: () => undefined, back: () => false, popTo: () => undefined };
  return buildSocket({
    runtime: { pool: { query: async () => ({ rows: [] }) }, session: 'dev-open', ...runtime },
    session: (token) => tokens.get(token) ?? null,
    identity: { resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, key: 'public' }) },
    running: { catalogFor: () => ({ ids: ['home'], hash: 'h' }) },
    hosts: {
      shells: { session: async () => ({ ...session, shell: Object.create(null) }), snapshot: () => Promise.reject(new Error('not asked here')), deliver: () => false, list: () => [], reset: () => false },
      pageAt: () => undefined,
    },
  });
};

afterEach(() => {
  vi.useRealTimers();
});

describe('the socket, as the server stands it up — what the runtime says reaches it', () => {
  it('`runtime.anonymousShellMax` is how many shells for nobody are alive at once', async () => {
    const socket = socketOf({ anonymousShellMax: 1 });
    try {
      const [first, second] = [terminal(), terminal()];
      await socket(SOCKET, first);
      await socket(SOCKET, second);
      expect([helloOf(first), errorsOf(first), first.closed]).toEqual([null, [], []]);
      expect([helloOf(second), errorsOf(second), second.closed]).toEqual([undefined, ['at_capacity'], [CLOSE_AT_CAPACITY]]);
    } finally {
      socket.stop();
    }
  });

  // A page served behind a proxy that rewrites `Host` is the app's own page
  // only because the deployment listed its origin: its cookie is read, and
  // the terminal is who the cookie says.
  it('`runtime.origins` lists the origins whose page is the app’s own', async () => {
    const tokens = new Map([['the-token', 'usr_1']]);
    const cookie = sessionCookies('https://app.example', 'the-token').map((written) => written.split(';')[0]).join('; ');
    const asked = (): Connection['upgrade'] => ({ offered: offerToken(null), origin: 'https://app.example', host: 'internal:8787', cookie, answer: () => undefined });

    const listed = socketOf({ origins: ['https://app.example'] }, tokens);
    const unlisted = socketOf({}, tokens);
    try {
      const [own, foreign] = [terminal(asked()), terminal(asked())];
      await listed(SOCKET, own);
      await unlisted(SOCKET, foreign);
      expect(helloOf(own)).toBe('usr_1');
      // Not listed: another site's page, whose cookie is not read.
      expect(helloOf(foreign)).toBeNull();
    } finally {
      listed.stop();
      unlisted.stop();
    }
  });

  it('`runtime.sessionRevalidateMs` is how often a live connection’s token is asked about again', async () => {
    vi.useFakeTimers();
    const tokens = new Map([['the-token', 'usr_1']]);
    const socket = socketOf({ sessionRevalidateMs: 2_000 }, tokens);
    try {
      const connection = terminal({ offered: offerToken('the-token') });
      await socket(SOCKET, connection);
      expect(helloOf(connection)).toBe('usr_1');

      // The session is revoked. The connection stands until it is asked about.
      tokens.delete('the-token');
      await vi.advanceTimersByTimeAsync(1_900);
      expect(connection.closed).toEqual([]);
      await vi.advanceTimersByTimeAsync(200);
      expect(errorsOf(connection)).toEqual(['invalid_token']);
      expect(connection.closed).toEqual([CLOSE_INVALID_TOKEN]);
    } finally {
      socket.stop();
    }
  });
});

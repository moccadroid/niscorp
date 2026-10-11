import { describe, it, expect, vi } from 'vitest';
import { DefinitionValidationError } from '@niscorp/nova';
import { createSocket, DEFAULT_ANONYMOUS_SHELL_MAX } from '../src/socket';
import type { Connection, SocketConfig } from '../src/socket';
import { CLOSE_AT_CAPACITY, CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT, CLOSE_SHELL_FAILED, CLOSE_PROTOCOL_MISMATCH, PROTOCOL, PROTOCOL_MIN, ServerMessageSchema, offerToken } from '../src/protocol';
import type { ServerMessage } from '../src/protocol';
import { createShellHost } from '../src/shells';
import type { ShellHost, ShellSession } from '../src/shells';
import { sealSession } from '../src/identity';
import type { NiscApp } from '../src/manifest';
import { hostConfig } from './shell-host-double';

// A fake transport — the four-function Connection seam, capturing everything
// so the protocol can be driven headlessly (no websocket).
class FakeConnection implements Connection {
  sent: ServerMessage[] = [];
  closed?: { code?: number; reason?: string };
  upgrade?: NonNullable<Connection['upgrade']>;
  seal?: (token: string) => Promise<string>;
  // what the upgrade was answered with, when the transport left the answering to moss
  answered?: readonly string[];
  // the order things happened in: 'answer', then each frame's type
  order: string[] = [];
  // the terminal behind this connection holds a token, and offered it on the upgrade
  offering(token: string): this { this.upgrade = { ...this.upgrade, offered: offerToken(token) }; return this; }
  // the upgrade came from a browser: where its page is, where it was addressed, the cookies it carried
  from(page: { origin: string | null; host: string; cookie?: string }): this {
    this.upgrade = { offered: offerToken(null), ...this.upgrade, origin: page.origin, host: page.host, cookie: page.cookie ?? null, answer: (cookies) => { this.answered = cookies; this.order.push('answer'); } };
    return this;
  }
  private onMsg?: (t: string) => void;
  private onCls?: () => void;
  // Whatever the socket sends, in any test here, is something a terminal reads:
  // the schema it is held to is the one the terminal parses with.
  send(text: string): void { const message = ServerMessageSchema.parse(JSON.parse(text)); this.sent.push(message); this.order.push(message.type); }
  close(code?: number, reason?: string): void { this.closed = { code, reason }; this.onCls?.(); }
  onMessage(fn: (t: string) => void): void { this.onMsg = fn; }
  onClose(fn: () => void): void { this.onCls = fn; }
  emit(msg: unknown): void { this.onMsg?.(JSON.stringify(msg)); }
  // text as it came off the transport, which need not be JSON at all
  emitText(text: string): void { this.onMsg?.(text); }
  first<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.sent.find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;
  }
}

const CATALOG = { ids: ['home', 'crm.deals'], hash: 'abc123' };

// The address of a current terminal: the protocol it speaks, and nothing about who it is.
const SOCKET = `/socket?protocol=${PROTOCOL}`;

// A recording shell session — proves the socket routes into the host.
const recordingSession = (): ShellSession & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    shell: {} as ShellSession['shell'],
    attach: (_connection, options) => calls.push(options?.delta === true ? 'attach:delta' : 'attach'),
    detach: () => calls.push('detach'),
    resync: () => calls.push('resync'),
    dispatch: (canvas, event) => calls.push(`dispatch:${canvas}:${(event as { type?: string }).type}`),
    publish: (channel) => calls.push(`publish:${channel}`),
    reset: () => calls.push('reset'),
    back: () => {
      calls.push('back');
      return true;
    },
    popTo: (canvas: string, instance: string) => calls.push(`popTo:${canvas}:${instance}`),
  };
};

// The host seam, filled out — the socket only ever calls `session`, but a
// partial object here would drift silently as the host grows.
const hostFor = (session: ShellSession): ShellHost => ({
  session: async () => session,
  snapshot: async () => ({ frame: [], trees: {}, settled: true, live: true, why: [], drawnWith: [] }),
  adopt: () => {},
  list: () => [],
  reset: () => false,
  stop: () => {},
  // `deliver` arrived with the socket fan-out and this literal did not follow —
  // exactly the drift the comment above warned about, which went unseen because
  // this directory was never typechecked. False: nothing in these tests pushes
  // to a principal, and a stub that claimed a successful delivery would be
  // asserting something no one asked it.
  deliver: () => false,
});

const ctxWith = (over: Partial<SocketConfig> = {}): SocketConfig => ({
  session: (token) => (token === 'good' ? 'usr_1' : null),
  catalog: () => CATALOG,
  ...over,
});

describe('socket — the authority channel', () => {
  it('anonymous (no token) gets hello with a null principal', async () => {
    const accept = createSocket(ctxWith());
    const conn = new FakeConnection();
    await accept(SOCKET, conn);
    const hello = conn.first('hello');
    expect(hello?.principal).toBeNull();
    expect(hello?.catalog.actions).toEqual(CATALOG.ids);
  });

  it('a valid token resolves the principal and its catalog', async () => {
    const accept = createSocket(ctxWith());
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    const hello = conn.first('hello');
    expect(hello?.principal).toBe('usr_1');
    expect(hello?.catalog.hash).toBe('abc123');
    expect(conn.closed).toBeUndefined();
  });

  it('hello says which protocol the server speaks', async () => {
    const accept = createSocket(ctxWith());
    const conn = new FakeConnection();
    await accept(`/socket?protocol=${PROTOCOL}`, conn);
    expect(conn.first('hello')?.protocol).toBe(PROTOCOL);
  });

  it('a terminal that names no protocol speaks 1 — every terminal built before the question — and is told to reload', async () => {
    const accept = createSocket(ctxWith());
    const conn = new FakeConnection();
    await accept('/socket', conn);
    expect(conn.first('error')?.code).toBe('client_too_old');
    expect(conn.closed?.code).toBe(CLOSE_PROTOCOL_MISMATCH);
    expect(conn.first('hello')).toBeUndefined();
  });

  // The address is what every proxy on the way writes into its log, so it is
  // not where a terminal says who it is — and a server that still read it
  // there would keep that open for whoever went on using it.
  it('a token in the address is not who the terminal is', async () => {
    const accept = createSocket(ctxWith());
    const conn = new FakeConnection();
    await accept(`${SOCKET}&token=good`, conn);
    expect(conn.first('hello')?.principal).toBeNull();
  });

  it.each([
    ['moss’s own', 'st_Zm9v-YmFy_QQ'],
    ['a provider’s, with dots, padding and symbols', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZGEifQ==.a+b/c=d'],
    ['not ASCII at all', 'ключ-🔑'],
  ])('the token a terminal offers arrives as it was held: %s', async (_label, held) => {
    const asked: string[] = [];
    const accept = createSocket(ctxWith({ session: (token) => (asked.push(token), 'usr_1') }));
    const conn = new FakeConnection().offering(held);
    // what is offered is a legal subprotocol, whatever the token is made of
    expect(conn.upgrade?.offered.every((entry) => /^[\w.-]+$/.test(entry))).toBe(true);
    await accept(SOCKET, conn);
    expect(asked).toEqual([held]);
    expect(conn.first('hello')?.principal).toBe('usr_1');
  });

  it.each([
    ['a transport that says nothing of the upgrade', undefined],
    ['an offer of `nisc` alone', { offered: ['nisc'] }],
    ['an offer that is not a token', { offered: ['nisc', 'nisc.token.%%%'] }],
    ['an offer of an empty token', { offered: ['nisc', 'nisc.token.'] }],
  ])('%s is nobody, and the verifier is never asked', async (_label, upgrade) => {
    const session = vi.fn(() => 'usr_1');
    const accept = createSocket(ctxWith({ session }));
    const conn = new FakeConnection();
    if (upgrade !== undefined) conn.upgrade = upgrade;
    await accept(SOCKET, conn);
    expect(conn.first('hello')?.principal).toBeNull();
    expect(session).not.toHaveBeenCalled();
  });

  it.each([
    ['older than the server serves', String(PROTOCOL_MIN - 1), 'client_too_old'],
    ['newer than the server speaks', String(PROTOCOL + 1), 'server_too_old'],
    ['not a protocol at all', 'banana', 'client_too_old'],
    // A protocol is digits. Read with `Number()`, each of these was the
    // protocol this server speaks, and its terminal was served.
    ['whose protocol is written in hex', `0x${PROTOCOL.toString(16)}`, 'client_too_old'],
    ['whose protocol is written with a fraction', `${PROTOCOL}.0`, 'client_too_old'],
    ['whose protocol is written with an exponent', `${PROTOCOL}e0`, 'client_too_old'],
    ['whose protocol is written with a space', `%20${PROTOCOL}`, 'client_too_old'],
  ])('a terminal %s is refused before anything is served: error then close 4426', async (_label, spoken, code) => {
    const session = recordingSession();
    const accept = createSocket(ctxWith({ shells: hostFor(session) }));
    const conn = new FakeConnection();
    await accept(`/socket?protocol=${spoken}`, conn.offering('good'));
    expect(conn.first('error')?.code).toBe(code);
    expect(conn.closed?.code).toBe(CLOSE_PROTOCOL_MISMATCH);
    expect(conn.first('hello')).toBeUndefined();
    expect(session.calls).toEqual([]);
  });

  it('an invalid token is refused: error then close 4401', async () => {
    const accept = createSocket(ctxWith());
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('bad'));
    expect(conn.first('error')?.code).toBe('invalid_token');
    expect(conn.closed?.code).toBe(CLOSE_INVALID_TOKEN);
    expect(conn.first('hello')).toBeUndefined();
  });

  it('with a shell host: attach on connect, detach on close', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    expect(session.calls).toContain('attach');
    conn.close();
    expect(session.calls).toContain('detach');
  });

  it('an event envelope routes to dispatch, tagged with its canvas', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.emit({ type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'x' } });
    expect(session.calls).toContain('dispatch:main:ui:click');
  });

  it('a publish envelope routes to publish', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.emit({ type: 'publish', channel: 'refresh' });
    expect(session.calls).toContain('publish:refresh');
  });

  it('a malformed message answers with an error, not a throw', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;
    conn.emit({ type: 'nonsense' });
    expect(conn.first('error')?.code).toBe('invalid_message');
  });

  // What a terminal sends is read as the protocol says it, whole, before any
  // of it is acted on. A message with a field too many used to be routed: the
  // fields the checks looked at were right, and the rest was never looked at.
  it.each([
    ['text that is not JSON', '{"type":"back"'],
    ['JSON that is not an object', '"back"'],
    ['a list', '[{"type":"back"}]'],
    ['a message of no type', '{"canvas":"main"}'],
    ['a back with a field back does not have', '{"type":"back","canvas":"main"}'],
    ['a reset with a field reset does not have', '{"type":"reset","hard":true}'],
    ['a resync with a field resync does not have', '{"type":"resync","canvas":"main"}'],
    ['a publish whose channel is not text', '{"type":"publish","channel":7}'],
    ['a publish with a field publish does not have', '{"type":"publish","channel":"refresh","to":"usr_2"}'],
    ['a popTo that names no instance', '{"type":"popTo","canvas":"main"}'],
    ['a popTo with a field popTo does not have', '{"type":"popTo","canvas":"main","instance":"a1","then":"reset"}'],
    ['an event that names no canvas', '{"type":"event","event":{"type":"ui:click"}}'],
    ['an event whose event is a list', '{"type":"event","canvas":"main","event":[]}'],
    ['an event whose event is nothing', '{"type":"event","canvas":"main","event":null}'],
    ['an event with a field event does not have', '{"type":"event","canvas":"main","event":{"type":"ui:click"},"as":"usr_2"}'],
  ])('%s is answered invalid_message, and none of it reaches the shell', async (_label, text) => {
    const session = recordingSession();
    const accept = createSocket(ctxWith({ shells: hostFor(session) }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;
    session.calls.length = 0;
    expect(() => conn.emitText(text)).not.toThrow();
    expect(conn.sent.map((message) => (message.type === 'error' ? message.code : message.type))).toEqual(['invalid_message']);
    expect(session.calls).toEqual([]);
    expect(conn.closed).toBeUndefined();
  });

  it('a popTo routes to the session, naming the canvas and the instance', async () => {
    const session = recordingSession();
    const accept = createSocket(ctxWith({ shells: hostFor(session) }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.emit({ type: 'popTo', canvas: 'main', instance: 'a1' });
    expect(session.calls).toContain('popTo:main:a1');
  });

  it('a publish carries its payload, whatever that is', async () => {
    const published: unknown[] = [];
    const session = { ...recordingSession(), publish: (_channel: string, payload?: unknown) => void published.push(payload) };
    const accept = createSocket(ctxWith({ shells: hostFor(session) }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.emit({ type: 'publish', channel: 'sel', payload: { id: 7 } });
    conn.emit({ type: 'publish', channel: 'sel', payload: null });
    conn.emit({ type: 'publish', channel: 'sel' });
    expect(published).toEqual([{ id: 7 }, null, undefined]);
  });

  it('without a shell host an event is answered no_shell', async () => {
    const accept = createSocket(ctxWith()); // no shells
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;
    conn.emit({ type: 'event', canvas: 'main', event: { type: 'ui:click' } });
    expect(conn.first('error')?.code).toBe('no_shell');
  });

  // RESET — the one envelope that names no canvas, because it is the recovery
  // for a session whose canvases are the broken thing.
  it('a reset envelope routes to the session reset, carrying no canvas', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;
    conn.emit({ type: 'reset' });
    expect(session.calls).toContain('reset');
    // Answered by the frames the reset produces, not by an envelope of its own.
    expect(conn.first('error')).toBeUndefined();
  });

  it('a reset without a shell host is answered no_shell, not silence', async () => {
    const accept = createSocket(ctxWith()); // no shells
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;
    conn.emit({ type: 'reset' });
    expect(conn.first('error')?.code).toBe('no_shell');
  });

  // BACK — one gesture over the whole shell, so it names no canvas either.
  it('a back envelope routes to the session back, carrying no canvas', async () => {
    const session = recordingSession();
    const accept = createSocket(ctxWith({ shells: hostFor(session) }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;
    conn.emit({ type: 'back' });
    expect(session.calls).toContain('back');
    // Answered by whatever canvases moved, not by an envelope of its own.
    expect(conn.first('error')).toBeUndefined();
  });

  it('a back without a shell host is answered no_shell, not invalid_message', async () => {
    const accept = createSocket(ctxWith()); // no shells
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;
    conn.emit({ type: 'back' });
    expect(conn.first('error')?.code).toBe('no_shell');
  });

  // RESYNC — the terminal's copy of a canvas drifted; the shell is fine.
  it('a resync envelope routes to the session resync, leaving the shell alone', async () => {
    const session = recordingSession();
    const accept = createSocket(ctxWith({ shells: hostFor(session) }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;
    conn.emit({ type: 'resync' });
    expect(session.calls).toContain('resync');
    expect(session.calls).not.toContain('reset');
    expect(conn.first('error')).toBeUndefined();
  });

  it('a resync without a shell host is answered no_shell', async () => {
    const accept = createSocket(ctxWith());
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;
    conn.emit({ type: 'resync' });
    expect(conn.first('error')?.code).toBe('no_shell');
  });

  // The delta capability is negotiated on the upgrade url —
  // a terminal that says nothing is a terminal that gets whole frames.
  it('?delta=1 attaches delta-capable; its absence does not', async () => {
    const asked = recordingSession();
    await createSocket(ctxWith({ shells: hostFor(asked) }))(`${SOCKET}&delta=1`, new FakeConnection().offering('good'));
    expect(asked.calls).toContain('attach:delta');

    const silent = recordingSession();
    await createSocket(ctxWith({ shells: hostFor(silent) }))(SOCKET, new FakeConnection().offering('good'));
    expect(silent.calls).toContain('attach');
    expect(silent.calls).not.toContain('attach:delta');
  });

  it('exposes the two application close codes', () => {
    expect(CLOSE_INVALID_TOKEN).toBe(4401);
    expect(CLOSE_SIGNED_OUT).toBe(4403);
  });
});

// ═══════════════════════════════════════════════════════════════
// REVALIDATION — identity asked twice. The HTTP surfaces re-ask on every
// request; a socket that asked only at upgrade is the hole every
// long-lived credential leaks through, and the reason an app could not
// give its tokens an expiry that meant anything on a live connection.
// ═══════════════════════════════════════════════════════════════

describe('socket — revalidating a live connection', () => {
  // A verifier an app could plausibly write: tokens resolve until they don't.
  const expiring = (): { verify: SocketConfig['session']; expire: () => void; asked: () => number } => {
    let alive = true;
    let asked = 0;
    return {
      verify: (token) => {
        asked += 1;
        return alive && token === 'good' ? 'usr_1' : null;
      },
      expire: () => void (alive = false),
      asked: () => asked,
    };
  };

  it('closes 4401 once the token stops resolving — the recovery the terminal already knows', async () => {
    vi.useFakeTimers();
    try {
      const auth = expiring();
      const accept = createSocket(ctxWith({ session: auth.verify, revalidateMs: 1000 }));
      const conn = new FakeConnection();
      await accept(SOCKET, conn.offering('good'));
      expect(conn.first('hello')?.principal).toBe('usr_1');

      // Still valid: many passes, no interference.
      await vi.advanceTimersByTimeAsync(5000);
      expect(conn.closed).toBeUndefined();

      auth.expire();
      await vi.advanceTimersByTimeAsync(1000);

      expect(conn.closed?.code).toBe(CLOSE_INVALID_TOKEN);
      // Diagnostics before authority, exactly as at upgrade.
      expect(conn.first('error')?.code).toBe('invalid_token');
      accept.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a token that starts resolving to SOMEBODY ELSE is not the session that attached', async () => {
    vi.useFakeTimers();
    try {
      let who = 'usr_1';
      const accept = createSocket(ctxWith({ session: () => who, revalidateMs: 1000 }));
      const conn = new FakeConnection();
      await accept(SOCKET, conn.offering('good'));
      who = 'usr_2';
      await vi.advanceTimersByTimeAsync(1000);
      expect(conn.closed?.code).toBe(CLOSE_INVALID_TOKEN);
      accept.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a verifier that THROWS is a fault, not a sign-out — nobody is closed on it', async () => {
    vi.useFakeTimers();
    try {
      let down = false;
      const accept = createSocket(
        ctxWith({
          session: () => {
            if (down) throw new Error('the session store is unreachable');
            return 'usr_1';
          },
          revalidateMs: 1000,
        }),
      );
      const conn = new FakeConnection();
      await accept(SOCKET, conn.offering('good'));

      down = true;
      await vi.advanceTimersByTimeAsync(5000);
      // Signing everybody out on a database blip turns a transient fault into
      // an outage. The connection rides it out and is asked again.
      expect(conn.closed).toBeUndefined();

      down = false;
      await vi.advanceTimersByTimeAsync(1000);
      expect(conn.closed).toBeUndefined();
      accept.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('anonymous connections are never revalidated — nothing they hold can expire', async () => {
    vi.useFakeTimers();
    try {
      const auth = expiring();
      const accept = createSocket(ctxWith({ session: auth.verify, revalidateMs: 1000 }));
      const conn = new FakeConnection();
      await accept(SOCKET, conn); // no token
      const before = auth.asked();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(auth.asked()).toBe(before);
      expect(conn.closed).toBeUndefined();
      accept.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a closed connection stops being asked about', async () => {
    vi.useFakeTimers();
    try {
      const auth = expiring();
      const accept = createSocket(ctxWith({ session: auth.verify, revalidateMs: 1000 }));
      const conn = new FakeConnection();
      await accept(SOCKET, conn.offering('good'));
      conn.close();
      const before = auth.asked();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(auth.asked()).toBe(before);
      accept.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('revalidateMs: 0 disables it — a token is trusted for the life of the connection', async () => {
    vi.useFakeTimers();
    try {
      const auth = expiring();
      const accept = createSocket(ctxWith({ session: auth.verify, revalidateMs: 0 }));
      const conn = new FakeConnection();
      await accept(SOCKET, conn.offering('good'));
      auth.expire();
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(conn.closed).toBeUndefined();
      accept.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the shell is detached when a connection expires — no leak behind a dead socket', async () => {
    vi.useFakeTimers();
    try {
      const auth = expiring();
      const session = recordingSession();
      const accept = createSocket(ctxWith({ session: auth.verify, shells: hostFor(session), revalidateMs: 1000 }));
      const conn = new FakeConnection();
      await accept(SOCKET, conn.offering('good'));
      expect(session.calls).toContain('attach');

      auth.expire();
      await vi.advanceTimersByTimeAsync(1000);
      expect(session.calls).toContain('detach');
      accept.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  // A pass asks the verifier about every connection, one after another. The
  // timer started the next pass whether or not that one had finished, so a
  // verifier that slowed down was asked more the slower it got.
  it('a pass that is still asking when the next one is due is not joined by a second', async () => {
    vi.useFakeTimers();
    try {
      let asking = 0;
      let most = 0;
      const slow = async (): Promise<string> => {
        asking += 1;
        most = Math.max(most, asking);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        asking -= 1;
        return 'usr_1';
      };
      let admitted = false;
      const accept = createSocket(ctxWith({ session: (token) => (admitted ? slow() : token === 'good' ? 'usr_1' : null), revalidateMs: 1000 }));
      await accept(SOCKET, new FakeConnection().offering('good'));
      admitted = true;

      await vi.advanceTimersByTimeAsync(10_000);
      expect(most).toBe(1);
      accept.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  // Nobody is closed on a verifier that cannot be asked. That it could not be
  // asked is still something a deployment has to be able to read: said once
  // for a pass, with the error, and not once for each connection.
  it('a verifier that cannot be asked is said in the log, once for a pass', async () => {
    vi.useFakeTimers();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let down = false;
      const accept = createSocket(
        ctxWith({
          session: () => {
            if (down) throw new Error('the session store is unreachable');
            return 'usr_1';
          },
          revalidateMs: 1000,
        }),
      );
      const connections = [new FakeConnection(), new FakeConnection(), new FakeConnection()];
      for (const conn of connections) await accept(SOCKET, conn.offering('good'));

      down = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(logged).toHaveBeenCalledTimes(1);
      expect(String(logged.mock.calls[0]?.[0])).toContain('3 of 3');
      expect(logged.mock.calls[0]?.some((part) => part instanceof Error && part.message === 'the session store is unreachable')).toBe(true);
      for (const conn of connections) expect(conn.closed).toBeUndefined();
      accept.stop();
    } finally {
      logged.mockRestore();
      vi.useRealTimers();
    }
  });

  // A connection whose transport throws when it is told (it is half gone) was
  // still in the map afterwards, so every pass threw on it again, at the same
  // place: no connection after it was ever asked about, or closed.
  it('a connection that cannot be told it expired does not keep the ones after it open', async () => {
    vi.useFakeTimers();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const auth = expiring();
      const accept = createSocket(ctxWith({ session: auth.verify, revalidateMs: 1000 }));
      const gone = new FakeConnection();
      const next = new FakeConnection();
      await accept(SOCKET, gone.offering('good'));
      await accept(SOCKET, next.offering('good'));
      gone.send = () => {
        throw new Error('the socket is not open');
      };

      auth.expire();
      await vi.advanceTimersByTimeAsync(1000);
      expect(next.closed?.code).toBe(CLOSE_INVALID_TOKEN);
      // the one that could not be told is closed all the same, and not asked about again
      expect(gone.closed?.code).toBe(CLOSE_INVALID_TOKEN);
      const before = auth.asked();
      await vi.advanceTimersByTimeAsync(5000);
      expect(auth.asked()).toBe(before);
      accept.stop();
    } finally {
      logged.mockRestore();
      vi.useRealTimers();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Refusing one session must never cost the others. Every await in accept can
// throw — a definition failing validation in the shell build, a verifier
// dying mid-upgrade — and the transport calls accept without awaiting it, so
// a rejection that escapes is an unhandled one and Node kills the process.
// These hold the contract: accept RESOLVES on failure, the refused terminal
// reads a sentence and a 4500, and the next connection is answered whole.
// ═══════════════════════════════════════════════════════════════

describe('socket — a refused session is one terminal, not the server', () => {
  it('a shell build failing validation refuses that terminal, naming the definitions', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    shells.session = async (_token, principal) => {
      if (principal === 'usr_1') {
        throw new DefinitionValidationError('2 action definition(s) failed validation', {
          failures: [
            { id: 'crm.deals', issues: [] },
            { id: 'crm.notes', issues: [] },
          ],
        });
      }
      return session;
    };
    const accept = createSocket(ctxWith({ shells }));

    const refused = new FakeConnection();
    await expect(accept(SOCKET, refused.offering('good'))).resolves.toBeUndefined();
    const error = refused.first('error');
    expect(error?.code).toBe('session_failed');
    expect(error?.message).toContain('crm.deals');
    expect(error?.message).toContain('crm.notes');
    expect(refused.closed?.code).toBe(CLOSE_SHELL_FAILED);

    // The server still answers: an anonymous terminal gets its whole session.
    const next = new FakeConnection();
    await accept(SOCKET, next);
    expect(next.first('hello')?.principal).toBeNull();
    expect(session.calls).toContain('attach');
    expect(next.closed).toBeUndefined();
  });

  it('a verifier dying mid-upgrade is the same refusal, not a process kill', async () => {
    const accept = createSocket(
      ctxWith({
        session: () => {
          throw new Error('the verifier is unreachable');
        },
      }),
    );
    const conn = new FakeConnection();
    await expect(accept(SOCKET, conn.offering('good'))).resolves.toBeUndefined();
    expect(conn.first('error')?.code).toBe('session_failed');
    expect(conn.closed?.code).toBe(CLOSE_SHELL_FAILED);

    // Anonymous never asks the verifier — the same server still answers it.
    const next = new FakeConnection();
    await accept(SOCKET, next);
    expect(next.first('hello')?.principal).toBeNull();
  });
});

// What a refused terminal reads is that it was refused. The error that refused
// it is the server's: it can name a host, a table, a user, a file. Whoever is
// on the other end of a socket has not yet been shown to be anybody, so it is
// logged here and none of its text is sent. The one thing a refusal does say
// is which definitions failed validation, which is the app's own artifacts by
// id and what a developer mid-edit is looking for.
describe('socket — a refusal does not carry the error that caused it', () => {
  const INTERNAL = 'connect ECONNREFUSED 10.1.2.3:5432 — password authentication failed for user "moss_rw"';

  it.each([
    ['the verifier throwing an Error', (): SocketConfig => ctxWith({ session: () => { throw new Error(INTERNAL); } })],
    ['the verifier throwing something that is not an Error', (): SocketConfig => ctxWith({ session: () => { throw INTERNAL; } })],
    ['the catalog throwing', (): SocketConfig => ctxWith({ catalog: () => { throw new Error(INTERNAL); } })],
    ['the shell build throwing', (): SocketConfig => ctxWith({ shells: { ...hostFor(recordingSession()), session: async () => { throw new Error(INTERNAL); } } })],
  ])('%s: the terminal reads a refusal and nothing of why; the log has it', async (_label, context) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const conn = new FakeConnection();
    await expect(createSocket(context())(SOCKET, conn.offering('good'))).resolves.toBeUndefined();

    const refusal = conn.sent.filter((message) => message.type === 'error');
    expect(refusal.map((message) => message.code)).toEqual(['session_failed']);
    for (const part of ['ECONNREFUSED', '10.1.2.3', '5432', 'moss_rw', 'password']) expect(JSON.stringify(conn.sent)).not.toContain(part);
    expect(conn.closed?.code).toBe(CLOSE_SHELL_FAILED);
    expect(conn.closed?.reason ?? '').not.toContain('ECONNREFUSED');
    expect(JSON.stringify(logged.mock.calls.map((call) => call.map((part) => (part instanceof Error ? part.message : part))))).toContain('ECONNREFUSED 10.1.2.3:5432');
    logged.mockRestore();
  });
});

// The same holds once a session is open. A transport calls the message handler
// from its own listener (on Node, ws's `message` event), and a throw there is
// an uncaught exception: one shell failing on one message, and the process
// every session lives in is gone. So the handler lets nothing out. What failed
// is logged where somebody can read it, the terminal is told that its message
// was not acted on and nothing of why, and the connection stays as it was.
describe('socket — a message that cannot be acted on is one message, not the server', () => {
  const INTERNAL = 'relation "deals" does not exist at 10.1.2.3:5432';
  const failing = (): ShellSession & { calls: string[] } => {
    const session = recordingSession();
    const fail = (): never => {
      throw new Error(INTERNAL);
    };
    return { ...session, dispatch: fail, publish: fail, popTo: fail, back: fail, reset: fail, resync: fail };
  };

  it.each([
    ['an event', { type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'x' } }],
    ['a publish', { type: 'publish', channel: 'refresh' }],
    ['a popTo', { type: 'popTo', canvas: 'main', instance: 'a1' }],
    ['a back', { type: 'back' }],
    ['a reset', { type: 'reset' }],
    ['a resync', { type: 'resync' }],
  ])('%s the shell throws on is logged here and answered there, and thrown at nobody', async (_label, message) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const accept = createSocket(ctxWith({ shells: hostFor(failing()) }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.sent.length = 0;

    expect(() => conn.emit(message)).not.toThrow();

    expect(conn.sent.map((sent) => (sent.type === 'error' ? sent.code : sent.type))).toEqual(['message_failed']);
    expect(JSON.stringify(conn.sent)).not.toContain('deals');
    expect(JSON.stringify(conn.sent)).not.toContain('10.1.2.3');
    expect(logged.mock.calls.some((call) => call.some((part) => part instanceof Error && part.message === INTERNAL))).toBe(true);
    expect(conn.closed).toBeUndefined();
    logged.mockRestore();
  });

  it('the connection goes on being served: the next message is acted on', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const session = recordingSession();
    const once = { ...session, back: (): boolean => { throw new Error(INTERNAL); } };
    const accept = createSocket(ctxWith({ shells: hostFor(once) }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.emit({ type: 'back' });
    conn.emit({ type: 'publish', channel: 'refresh' });
    expect(session.calls).toContain('publish:refresh');
    logged.mockRestore();
  });

  // The terminal may be gone by the time there is something to tell it. That
  // is one more thing that must not leave the handler.
  it('a transport that throws on the answer costs nothing either', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const accept = createSocket(ctxWith({ shells: hostFor(failing()) }));
    const conn = new FakeConnection();
    await accept(SOCKET, conn.offering('good'));
    conn.send = () => {
      throw new Error('the socket is not open');
    };
    expect(() => conn.emit({ type: 'back' })).not.toThrow();
    expect(() => conn.emitText('not a message')).not.toThrow();
    logged.mockRestore();
  });
});

// A terminal served by the app it talks to does not hold its session: its
// browser does, in a cookie the page cannot read, and sends it with the
// upgrade. The answer to the upgrade is where that cookie is written.
describe('socket — a browser on the app’s own page', () => {
  const HERE = { origin: 'https://app.example.com', host: 'app.example.com' };

  it('is who the cookie its browser sent says, and nothing new is written', async () => {
    const conn = new FakeConnection().from({ ...HERE, cookie: 'theme=dark; __Host-nisc.token=good' });
    await createSocket(ctxWith())(SOCKET, conn);
    expect(conn.first('hello')?.principal).toBe('usr_1');
    expect(conn.answered).toBeUndefined();
  });

  it.each([
    ['another port on the same host', { origin: 'https://app.example.com:8443', host: 'app.example.com' }],
    ['a sibling subdomain', { origin: 'https://evil.example.com', host: 'app.example.com' }],
    ['another site', { origin: 'https://example.org', host: 'app.example.com' }],
    ['an opaque origin', { origin: 'null', host: 'app.example.com' }],
    ['a request that names no origin', { origin: null, host: 'app.example.com' }],
  ])('the same cookie sent with a page from %s is nobody, and nothing is written', async (_label, page) => {
    const session = vi.fn(() => 'usr_1');
    const conn = new FakeConnection().from({ ...page, cookie: '__Host-nisc.token=good; nisc.token=good; __Host-nisc.token.8443=good' });
    await createSocket(ctxWith({ session }))(SOCKET, conn);
    expect(conn.first('hello')?.principal).toBeNull();
    expect(session).not.toHaveBeenCalled();
    expect(conn.answered).toBeUndefined();
  });

  it('a token the page offers is moved into the cookie by the answer — before anything is said', async () => {
    const conn = new FakeConnection().from(HERE).offering('good');
    await createSocket(ctxWith())(SOCKET, conn);
    expect(conn.first('hello')?.principal).toBe('usr_1');
    expect(conn.answered).toEqual(['__Host-nisc.token=good; HttpOnly; Path=/; SameSite=Lax; Secure', 'nisc.token.held=1; Path=/; SameSite=Lax; Secure']);
    expect(conn.order[0]).toBe('answer');
  });

  // Over plain http on the default port, the script-readable copy an earlier
  // build kept has the very name of this cookie. The browser sends it, the
  // page offers the same token from storage — and the answer replaces the copy
  // with one script cannot read.
  it('a token the page offers is written even when the browser sent the same one', async () => {
    const conn = new FakeConnection().from({ origin: 'http://intranet.example', host: 'intranet.example', cookie: 'nisc.token=good' }).offering('good');
    await createSocket(ctxWith())(SOCKET, conn);
    expect(conn.first('hello')?.principal).toBe('usr_1');
    expect(conn.answered).toEqual(['nisc.token=good; HttpOnly; Path=/; SameSite=Lax', 'nisc.token.held=1; Path=/; SameSite=Lax']);
  });

  it('…and the browser is told to keep it for as long as it resolves, when the credential knows', async () => {
    const conn = new FakeConnection().from(HERE).offering('good');
    await createSocket(ctxWith({ sessionLastsMs: () => 90_500 }))(SOCKET, conn);
    expect(conn.answered?.every((cookie) => cookie.endsWith('; Max-Age=90'))).toBe(true);
  });

  it('a token offered from another origin is who the terminal is, and no cookie is written', async () => {
    const conn = new FakeConnection().from({ origin: 'https://console.example.org', host: 'app.example.com' }).offering('good');
    await createSocket(ctxWith())(SOCKET, conn);
    expect(conn.first('hello')?.principal).toBe('usr_1');
    expect(conn.answered).toBeUndefined();
  });

  it('a cookie that no longer resolves is nobody — served, not refused — and is taken back', async () => {
    const conn = new FakeConnection().from({ ...HERE, cookie: '__Host-nisc.token=stale' });
    await createSocket(ctxWith())(SOCKET, conn);
    expect(conn.first('hello')?.principal).toBeNull();
    expect(conn.closed).toBeUndefined();
    expect(conn.answered).toEqual(['__Host-nisc.token=; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=0', 'nisc.token.held=; Path=/; SameSite=Lax; Secure; Max-Age=0']);
  });

  // A sign-out under an app's own provider leaves a token that still resolves
  // in the browser; the terminal says it was signed out, and it is taken back.
  it('a terminal that says it is leaving is nobody whatever its browser holds, and the cookie is taken back', async () => {
    const session = vi.fn(() => 'usr_1');
    const conn = new FakeConnection().from({ ...HERE, cookie: '__Host-nisc.token=good' });
    await createSocket(ctxWith({ session }))(`${SOCKET}&leave=1`, conn);
    expect(conn.first('hello')?.principal).toBeNull();
    expect(session).not.toHaveBeenCalled();
    expect(conn.answered?.[0]).toContain('Max-Age=0');
  });

  it('nobody, holding nothing: no cookie is written for them', async () => {
    const conn = new FakeConnection().from(HERE);
    await createSocket(ctxWith())(SOCKET, conn);
    expect(conn.first('hello')?.principal).toBeNull();
    expect(conn.answered).toBeUndefined();
  });

  it('each seat is a cookie of its own', async () => {
    const seat = `${SOCKET}&key=nisc.token.speaker`;
    const other = new FakeConnection().from({ ...HERE, cookie: '__Host-nisc.token=good' });
    await createSocket(ctxWith())(seat, other);
    expect(other.first('hello')?.principal).toBeNull();
    const mine = new FakeConnection().from({ ...HERE, cookie: '__Host-nisc.token.speaker=good' });
    await createSocket(ctxWith())(seat, mine);
    expect(mine.first('hello')?.principal).toBe('usr_1');
    const signingIn = new FakeConnection().from(HERE).offering('good');
    await createSocket(ctxWith())(seat, signingIn);
    expect(signingIn.answered?.map((cookie) => cookie.split('=')[0])).toEqual(['__Host-nisc.token.speaker', 'nisc.token.speaker.held']);
  });

  // A browser keeps cookies by host and not by port, so a page on a port names
  // it — or two apps on localhost would sign each other out.
  it('on a port, over plain http: the name ends with the port, and another app’s cookie is neither read nor touched', async () => {
    const local = { origin: 'http://localhost:5173', host: 'localhost:5173' };
    const signingIn = new FakeConnection().from(local).offering('good');
    await createSocket(ctxWith())(SOCKET, signingIn);
    expect(signingIn.answered).toEqual(['nisc.token.5173=good; HttpOnly; Path=/; SameSite=Lax', 'nisc.token.5173.held=1; Path=/; SameSite=Lax']);
    const back = new FakeConnection().from({ ...local, cookie: 'nisc.token.5173=good' });
    await createSocket(ctxWith())(SOCKET, back);
    expect(back.first('hello')?.principal).toBe('usr_1');
    const session = vi.fn(() => 'usr_1');
    const others = new FakeConnection().from({ ...local, cookie: 'nisc.token.3000=good; nisc.token=good' });
    await createSocket(ctxWith({ session }))(SOCKET, others);
    expect(others.first('hello')?.principal).toBeNull();
    expect(session).not.toHaveBeenCalled();
    expect(others.answered).toBeUndefined();
  });

  it('behind a proxy that rewrites Host, the deployment lists where the app is served — and only there', async () => {
    const proxied = { host: 'moss:8787', cookie: '__Host-nisc.token=good' };
    const listed = new FakeConnection().from({ ...proxied, origin: 'https://app.example.com' });
    await createSocket(ctxWith({ origins: ['https://app.example.com'] }))(SOCKET, listed);
    expect(listed.first('hello')?.principal).toBe('usr_1');
    const unlisted = new FakeConnection().from({ ...proxied, origin: 'https://evil.example.com' });
    await createSocket(ctxWith({ origins: ['https://app.example.com'] }))(SOCKET, unlisted);
    expect(unlisted.first('hello')?.principal).toBeNull();
  });

  it('a transport that had already answered the upgrade: the cookie is read, and nothing can be written', async () => {
    const conn = new FakeConnection().from({ ...HERE, cookie: '__Host-nisc.token=good' });
    delete conn.upgrade?.answer;
    await createSocket(ctxWith())(SOCKET, conn);
    expect(conn.first('hello')?.principal).toBe('usr_1');
    const offering = new FakeConnection().from(HERE).offering('good');
    delete offering.upgrade?.answer;
    await createSocket(ctxWith())(SOCKET, offering);
    expect(offering.first('hello')?.principal).toBe('usr_1');
  });
});

// A sign-in made over the socket has to reach the browser's cookie through the
// page. It goes sealed with a key in a second cookie the page cannot read.
describe('socket — a sign-in handed over sealed', () => {
  const HERE = { origin: 'https://app.example.com', host: 'app.example.com' };
  const ASKING = `${SOCKET}&sealed=1`;
  const offeringSealed = (conn: FakeConnection, sealed: string): FakeConnection => {
    conn.upgrade = { ...conn.upgrade, offered: offerToken(null, sealed) };
    return conn;
  };

  it('a terminal whose browser can keep a session is given a seal by the answer to its first upgrade — for the socket’s path only', async () => {
    const conn = new FakeConnection().from(HERE);
    await createSocket(ctxWith())(ASKING, conn);
    expect(conn.first('hello')?.principal).toBeNull();
    expect(conn.answered).toHaveLength(1);
    expect(conn.answered?.[0]).toMatch(/^__Http-nisc\.seal=[\w-]{43}; HttpOnly; Path=\/socket; SameSite=Lax; Secure$/);
    // and a sign-in on this connection is sealed with it
    const seal = conn.answered?.[0]?.split(';')[0]?.split('=')[1] ?? '';
    const sealed = await conn.seal?.('good');
    const back = offeringSealed(new FakeConnection().from({ ...HERE, cookie: `__Http-nisc.seal=${seal}` }), sealed ?? '');
    await createSocket(ctxWith())(ASKING, back);
    expect(back.first('hello')?.principal).toBe('usr_1');
  });

  // A request shows a cookie's name and value and nothing of who set it. So
  // over https the seal is read under the one name a browser lets no script
  // set: a seal under any other name is not this browser's key, whoever put it there.
  it('a seal under a name a script could have set is not read, and the browser is given its own', async () => {
    const conn = new FakeConnection().from({ ...HERE, cookie: 'nisc.seal=PLANTED; __Secure-nisc.seal=PLANTED' });
    await createSocket(ctxWith())(ASKING, conn);
    expect(conn.answered).toHaveLength(1);
    expect(conn.answered?.[0]).toMatch(/^__Http-nisc\.seal=[\w-]{43}; HttpOnly; /);
    const sealedForThisBrowser = (await conn.seal?.('good')) ?? '';
    const planter = offeringSealed(new FakeConnection().from({ ...HERE, cookie: '__Http-nisc.seal=PLANTED' }), sealedForThisBrowser);
    await createSocket(ctxWith())(ASKING, planter);
    expect(planter.first('hello')?.principal).toBeNull();
  });

  it('a browser that sent its seal keeps it: no two upgrades disagree about the key', async () => {
    const conn = new FakeConnection().from({ ...HERE, cookie: '__Http-nisc.seal=the-seal-it-has' });
    await createSocket(ctxWith())(ASKING, conn);
    expect(conn.answered).toBeUndefined();
    expect(await conn.seal?.('good')).toBeDefined();
  });

  it('a sealed sign-in offered back with the seal it was sealed with is who the terminal is, and is moved into the cookie', async () => {
    const conn = offeringSealed(new FakeConnection().from({ ...HERE, cookie: '__Http-nisc.seal=the-seal' }), await sealSession('the-seal', 'good'));
    await createSocket(ctxWith())(ASKING, conn);
    expect(conn.first('hello')?.principal).toBe('usr_1');
    expect(conn.answered).toEqual(['__Host-nisc.token=good; HttpOnly; Path=/; SameSite=Lax; Secure', 'nisc.token.held=1; Path=/; SameSite=Lax; Secure']);
  });

  it.each([
    ['a browser with another seal', async () => ({ cookie: '__Http-nisc.seal=another', sealed: await sealSession('the-seal', 'good') })],
    ['too late', async () => ({ cookie: '__Http-nisc.seal=the-seal', sealed: await sealSession('the-seal', 'good', -1) })],
    ['with something that is not a sealed sign-in', async () => ({ cookie: '__Http-nisc.seal=the-seal', sealed: 'bm90LXNlYWxlZA' })],
  ])('offered back by %s, it opens nothing: nobody, and the verifier is never asked', async (_label, given) => {
    const { cookie, sealed } = await given();
    const session = vi.fn(() => 'usr_1');
    const conn = offeringSealed(new FakeConnection().from({ ...HERE, cookie }), sealed);
    await createSocket(ctxWith({ session }))(ASKING, conn);
    expect(conn.first('hello')?.principal).toBeNull();
    expect(session).not.toHaveBeenCalled();
    expect(conn.first('error')).toBeUndefined();
  });

  // A browser that does not keep the seal could never sign in this way: it is
  // told, so its terminal stops asking and is handed the next one as a token.
  it('offered back by a browser that sent no seal: nobody, and the terminal is told its browser does not keep one', async () => {
    const conn = offeringSealed(new FakeConnection().from(HERE), await sealSession('the-seal', 'good'));
    await createSocket(ctxWith())(ASKING, conn);
    expect(conn.first('hello')?.principal).toBeNull();
    expect(conn.first('error')?.code).toBe('seal_not_kept');
    expect(conn.closed).toBeUndefined();
    // and it is given no other seal: a sign-in on this very connection is handed over as its token
    expect(conn.answered).toBeUndefined();
    expect(conn.seal).toBeUndefined();
  });

  // Behind a proxy that rewrites `Host`, every page of the app looks like a
  // page from somewhere else: it works, on its own token, and nothing else
  // would say the session is not being kept by the browser.
  it('a browser terminal that is not on the app’s own page is said so, once', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const accept = createSocket(ctxWith());
    const proxied = { origin: 'https://app.example.com', host: '127.0.0.1:8787' };
    await accept(ASKING, new FakeConnection().from(proxied));
    await accept(ASKING, new FakeConnection().from(proxied));
    expect(warned).toHaveBeenCalledTimes(1);
    expect(String(warned.mock.calls[0]?.[0])).toContain('runtime.origins');
    // a terminal that keeps its own token by design (a process) is not what this is about
    await createSocket(ctxWith())(SOCKET, new FakeConnection().from(proxied));
    expect(warned).toHaveBeenCalledTimes(1);
    warned.mockRestore();
  });

  it.each([
    ['a terminal that did not ask', SOCKET, HERE, true],
    ['a page on another origin', ASKING, { origin: 'https://evil.example.com', host: 'app.example.com' }, true],
    ['a transport that had already answered, so no seal can be given', ASKING, HERE, false],
  ])('%s is given no seal, and handed a sign-in as its token', async (_label, address, page, canAnswer) => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const conn = new FakeConnection().from(page);
    if (!canAnswer) delete conn.upgrade?.answer;
    await createSocket(ctxWith())(address, conn);
    expect(conn.answered).toBeUndefined();
    expect(conn.seal).toBeUndefined();
    warned.mockRestore();
  });
});

// A session takes time to stand up: who somebody is and what they hold are
// asked, and their shell is built. The terminal may be gone by then. On Node
// the transport tells a close to whoever is listening when it happens, and to
// nobody who starts listening afterwards — so a connection attached after it
// closed was attached for ever: a kept shell never idled, a throwaway one was
// never disposed.
describe('socket — a connection that closed before its session was ready', () => {
  const counter = { id: 'counter', data: { n: 0 }, triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }] };
  const app = { charter: { public: ['counter'] }, assignments: {}, actions: { counter }, shell: { canvases: [{ id: 'main', initial: 'counter' }] } } as unknown as NiscApp;
  const realHost = (): ShellHost =>
    createShellHost(
      hostConfig({
        app,
        resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: ['counter'], hash: 'h' }, variants: new Map() }),
        wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
        idleMs: 0,
      }),
    );

  // A transport as `ws` is one: a close reaches the listeners there are, once.
  const droppable = (): { connection: Connection; drop: () => void } => {
    const listeners: (() => void)[] = [];
    let dropped = false;
    return {
      connection: {
        send: () => {},
        close: () => {},
        onMessage: () => {},
        onClose: (fn) => {
          if (!dropped) listeners.push(fn);
        },
      },
      drop: () => {
        dropped = true;
        for (const fn of listeners.splice(0)) fn();
      },
    };
  };

  // The host, with the moment its session is handed over held back: the test
  // closes the connection in between.
  const heldBack = (host: ShellHost): { shells: Pick<ShellHost, 'session'>; built: () => ShellSession | undefined; release: () => void } => {
    let built: ShellSession | undefined;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => void (release = resolve));
    return {
      shells: {
        session: async (token, principal, options) => {
          built = await host.session(token, principal, options);
          await gate;
          return built;
        },
      },
      built: () => built,
      release: () => release(),
    };
  };

  it('somebody signed in: their shell has nothing attached, and idles from then', async () => {
    const host = realHost();
    const held = heldBack(host);
    const accept = createSocket(ctxWith({ shells: held.shells, revalidateMs: 0 }));
    const { connection, drop } = droppable();
    connection.upgrade = { offered: offerToken('good') };
    const accepting = accept(SOCKET, connection);
    await vi.waitFor(() => expect(held.built()).toBeDefined());

    drop();
    held.release();
    await accepting;

    expect(host.list().map((shell) => ({ principal: shell.principal, connections: shell.connections, idle: shell.idleSince !== null }))).toEqual([{ principal: 'usr_1', connections: 0, idle: true }]);
    host.stop();
  });

  it('nobody signed in: the shell built for that connection is disposed', async () => {
    const host = realHost();
    const held = heldBack(host);
    const accept = createSocket(ctxWith({ shells: held.shells, revalidateMs: 0 }));
    const { connection, drop } = droppable();
    const accepting = accept(SOCKET, connection);
    await vi.waitFor(() => expect(held.built()).toBeDefined());

    drop();
    held.release();
    await accepting;

    expect(() => held.built()?.shell.push('main', 'counter')).toThrow();
    host.stop();
  });

  it('a connection that closes while what it holds is being asked is not handed to a shell host at all', async () => {
    const session = recordingSession();
    const asked = vi.fn(async () => session);
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => void (release = resolve));
    const accept = createSocket(ctxWith({ shells: { session: asked }, catalog: async () => (await gate, CATALOG), revalidateMs: 0 }));
    const { connection, drop } = droppable();
    const accepting = accept(SOCKET, connection);
    await new Promise((resolve) => setTimeout(resolve, 0));

    drop();
    release();
    await accepting;

    expect(asked).not.toHaveBeenCalled();
    expect(session.calls).toEqual([]);
  });
});

// Somebody signed in has one shell, however many terminals they open. Nobody
// signed in has one for each connection, and a connection costs whoever opens
// it nothing: no account, no token. So how many of those are alive at once has
// a limit, and a connection over it is told so and closed.
describe('socket — shells for nobody alive at once', () => {
  // A host that counts what it was asked for, and by whom.
  const counting = (): { shells: Pick<ShellHost, 'session'>; asked: (string | null)[] } => {
    const asked: (string | null)[] = [];
    return { shells: { session: async (_token, principal) => (asked.push(principal), recordingSession()) }, asked };
  };

  it('a connection for nobody over the limit is told so in one sentence and closed, and no shell is built for it', async () => {
    const host = counting();
    const accept = createSocket(ctxWith({ shells: host.shells, anonymousShellMax: 2 }));
    const served = [new FakeConnection(), new FakeConnection()];
    for (const conn of served) await accept(SOCKET, conn);
    expect(host.asked).toEqual([null, null]);

    const over = new FakeConnection();
    await accept(SOCKET, over);
    expect(over.sent.map((message) => (message.type === 'error' ? message.code : message.type))).toEqual(['at_capacity']);
    expect(over.first('error')?.message).toBe('This server is serving as many terminals with nobody signed in as it is set to. Try again in a moment.');
    expect(over.closed?.code).toBe(CLOSE_AT_CAPACITY);
    expect(host.asked).toEqual([null, null]);
    // the ones being served are not touched
    for (const conn of served) expect(conn.closed).toBeUndefined();
  });

  it('somebody signed in is served whatever the count for nobody is', async () => {
    const host = counting();
    const accept = createSocket(ctxWith({ shells: host.shells, anonymousShellMax: 1, revalidateMs: 0 }));
    await accept(SOCKET, new FakeConnection());
    const signedIn = new FakeConnection();
    await accept(SOCKET, signedIn.offering('good'));
    expect(signedIn.first('hello')?.principal).toBe('usr_1');
    expect(signedIn.closed).toBeUndefined();
    expect(host.asked).toEqual([null, 'usr_1']);
  });

  it('a place is given back when its connection closes', async () => {
    const host = counting();
    const accept = createSocket(ctxWith({ shells: host.shells, anonymousShellMax: 1 }));
    const first = new FakeConnection();
    await accept(SOCKET, first);
    first.close();
    const next = new FakeConnection();
    await accept(SOCKET, next);
    expect(next.first('hello')?.principal).toBeNull();
    expect(next.closed).toBeUndefined();
  });

  it('…and when its shell could not be built', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    let failing = true;
    const shells: Pick<ShellHost, 'session'> = {
      session: async () => {
        if (failing) throw new Error('a definition failed');
        return recordingSession();
      },
    };
    const accept = createSocket(ctxWith({ shells, anonymousShellMax: 1 }));
    const refused = new FakeConnection();
    await accept(SOCKET, refused);
    expect(refused.closed?.code).toBe(CLOSE_SHELL_FAILED);
    failing = false;
    const next = new FakeConnection();
    await accept(SOCKET, next);
    expect(next.closed).toBeUndefined();
    logged.mockRestore();
  });

  it('arrivals in one moment do not get past it together', async () => {
    const host = counting();
    const accept = createSocket(ctxWith({ shells: host.shells, anonymousShellMax: 3 }));
    const arriving = Array.from({ length: 10 }, () => new FakeConnection());
    await Promise.all(arriving.map((conn) => accept(SOCKET, conn)));
    expect(host.asked).toHaveLength(3);
    expect(arriving.filter((conn) => conn.closed?.code === CLOSE_AT_CAPACITY)).toHaveLength(7);
  });

  it('a page’s shell for nobody counts as the app’s does', async () => {
    const host = counting();
    const page = counting();
    const accept = createSocket(ctxWith({ shells: host.shells, page: (path) => (path === '/docs' ? { host: page.shells, inputs: {} } : undefined), anonymousShellMax: 1 }));
    await accept(`${SOCKET}&path=/docs`, new FakeConnection());
    const over = new FakeConnection();
    await accept(SOCKET, over);
    expect(over.closed?.code).toBe(CLOSE_AT_CAPACITY);
    expect([page.asked, host.asked]).toEqual([[null], []]);
  });

  it('an app that serves no shell builds none, and counts none', async () => {
    const accept = createSocket(ctxWith({ anonymousShellMax: 1 }));
    for (const conn of [new FakeConnection(), new FakeConnection(), new FakeConnection()]) {
      await accept(SOCKET, conn);
      expect(conn.closed).toBeUndefined();
    }
  });

  it('told nothing, the limit is the default', async () => {
    expect(DEFAULT_ANONYMOUS_SHELL_MAX).toBe(1000);
    const host = counting();
    const accept = createSocket(ctxWith({ shells: host.shells }));
    const arriving = Array.from({ length: DEFAULT_ANONYMOUS_SHELL_MAX + 1 }, () => new FakeConnection());
    for (const conn of arriving) await accept(SOCKET, conn);
    expect(arriving.filter((conn) => conn.closed !== undefined)).toHaveLength(1);
    expect(arriving.at(-1)?.closed?.code).toBe(CLOSE_AT_CAPACITY);
  });

  it('`Infinity` is no limit', async () => {
    const host = counting();
    const accept = createSocket(ctxWith({ shells: host.shells, anonymousShellMax: Infinity }));
    const arriving = Array.from({ length: DEFAULT_ANONYMOUS_SHELL_MAX + 5 }, () => new FakeConnection());
    for (const conn of arriving) await accept(SOCKET, conn);
    expect(arriving.every((conn) => conn.closed === undefined)).toBe(true);
  });
});

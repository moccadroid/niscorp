import { describe, it, expect, vi } from 'vitest';
import { DefinitionValidationError } from '@niscorp/nova';
import { createSocket, CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT, CLOSE_SHELL_FAILED, CLOSE_PROTOCOL_MISMATCH, PROTOCOL, PROTOCOL_MIN, offerToken } from '../src/socket';
import type { Connection, ServerMessage, SocketContext } from '../src/socket';
import type { ShellHost, ShellSession } from '../src/shells';

// A fake transport — the four-function Connection seam, capturing everything
// so the protocol can be driven headlessly (no websocket).
class FakeConnection implements Connection {
  sent: ServerMessage[] = [];
  closed?: { code?: number; reason?: string };
  upgrade?: NonNullable<Connection['upgrade']>;
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
  send(text: string): void { this.sent.push(JSON.parse(text) as ServerMessage); this.order.push((JSON.parse(text) as ServerMessage).type); }
  close(code?: number, reason?: string): void { this.closed = { code, reason }; this.onCls?.(); }
  onMessage(fn: (t: string) => void): void { this.onMsg = fn; }
  onClose(fn: () => void): void { this.onCls = fn; }
  emit(msg: unknown): void { this.onMsg?.(JSON.stringify(msg)); }
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

const ctxWith = (over: Partial<SocketContext> = {}): SocketContext => ({
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
  const expiring = (): { verify: SocketContext['session']; expire: () => void; asked: () => number } => {
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

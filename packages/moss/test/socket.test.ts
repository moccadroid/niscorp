import { describe, it, expect, vi } from 'vitest';
import { createSocket, CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT } from '../src/socket';
import type { Connection, ServerMessage, SocketContext } from '../src/socket';
import type { ShellHost, ShellSession } from '../src/shells';

// A fake transport — the four-function Connection seam, capturing everything
// so the protocol can be driven headlessly (no websocket).
class FakeConnection implements Connection {
  sent: ServerMessage[] = [];
  closed?: { code?: number; reason?: string };
  private onMsg?: (t: string) => void;
  private onCls?: () => void;
  send(text: string): void { this.sent.push(JSON.parse(text) as ServerMessage); }
  close(code?: number, reason?: string): void { this.closed = { code, reason }; this.onCls?.(); }
  onMessage(fn: (t: string) => void): void { this.onMsg = fn; }
  onClose(fn: () => void): void { this.onCls = fn; }
  emit(msg: unknown): void { this.onMsg?.(JSON.stringify(msg)); }
  first<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.sent.find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;
  }
}

const CATALOG = { ids: ['home', 'crm.deals'], hash: 'abc123' };

// A recording shell session — proves the socket routes into the host.
const recordingSession = (): ShellSession & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    shell: {} as ShellSession['shell'],
    attach: () => calls.push('attach'),
    detach: () => calls.push('detach'),
    dispatch: (canvas, event) => calls.push(`dispatch:${canvas}:${(event as { type?: string }).type}`),
    publish: (channel) => calls.push(`publish:${channel}`),
    reset: () => calls.push('reset'),
  };
};

// The host seam, filled out — the socket only ever calls `session`, but a
// partial object here would drift silently as the host grows.
const hostFor = (session: ShellSession): ShellHost => ({
  session: () => session,
  adopt: () => {},
  list: () => [],
  reset: () => false,
  stop: () => {},
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
    await accept('/socket', conn);
    const hello = conn.first('hello');
    expect(hello?.principal).toBeNull();
    expect(hello?.catalog.actions).toEqual(CATALOG.ids);
  });

  it('a valid token resolves the principal and its catalog', async () => {
    const accept = createSocket(ctxWith());
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
    const hello = conn.first('hello');
    expect(hello?.principal).toBe('usr_1');
    expect(hello?.catalog.hash).toBe('abc123');
    expect(conn.closed).toBeUndefined();
  });

  it('an invalid token is refused: error then close 4401', async () => {
    const accept = createSocket(ctxWith());
    const conn = new FakeConnection();
    await accept('/socket?token=bad', conn);
    expect(conn.first('error')?.code).toBe('invalid_token');
    expect(conn.closed?.code).toBe(CLOSE_INVALID_TOKEN);
    expect(conn.first('hello')).toBeUndefined();
  });

  it('with a shell host: attach on connect, detach on close', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
    expect(session.calls).toContain('attach');
    conn.close();
    expect(session.calls).toContain('detach');
  });

  it('an event envelope routes to dispatch, tagged with its canvas', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
    conn.emit({ type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'x' } });
    expect(session.calls).toContain('dispatch:main:ui:click');
  });

  it('a publish envelope routes to publish', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
    conn.emit({ type: 'publish', channel: 'refresh' });
    expect(session.calls).toContain('publish:refresh');
  });

  it('a malformed message answers with an error, not a throw', async () => {
    const session = recordingSession();
    const shells = hostFor(session);
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
    conn.sent.length = 0;
    conn.emit({ type: 'nonsense' });
    expect(conn.first('error')?.code).toBe('invalid_message');
  });

  it('without a shell host an event is answered no_shell', async () => {
    const accept = createSocket(ctxWith()); // no shells
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
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
    await accept('/socket?token=good', conn);
    conn.sent.length = 0;
    conn.emit({ type: 'reset' });
    expect(session.calls).toContain('reset');
    // Answered by the frames the reset produces, not by an envelope of its own.
    expect(conn.first('error')).toBeUndefined();
  });

  it('a reset without a shell host is answered no_shell, not silence', async () => {
    const accept = createSocket(ctxWith()); // no shells
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
    conn.sent.length = 0;
    conn.emit({ type: 'reset' });
    expect(conn.first('error')?.code).toBe('no_shell');
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
      await accept('/socket?token=good', conn);
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
      await accept('/socket?token=good', conn);
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
      await accept('/socket?token=good', conn);

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
      await accept('/socket', conn); // no token
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
      await accept('/socket?token=good', conn);
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
      await accept('/socket?token=good', conn);
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
      await accept('/socket?token=good', conn);
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

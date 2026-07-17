import { describe, it, expect } from 'vitest';
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
  };
};

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
    const shells: ShellHost = { session: () => session };
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
    expect(session.calls).toContain('attach');
    conn.close();
    expect(session.calls).toContain('detach');
  });

  it('an event envelope routes to dispatch, tagged with its canvas', async () => {
    const session = recordingSession();
    const shells: ShellHost = { session: () => session };
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
    conn.emit({ type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'x' } });
    expect(session.calls).toContain('dispatch:main:ui:click');
  });

  it('a publish envelope routes to publish', async () => {
    const session = recordingSession();
    const shells: ShellHost = { session: () => session };
    const accept = createSocket(ctxWith({ shells }));
    const conn = new FakeConnection();
    await accept('/socket?token=good', conn);
    conn.emit({ type: 'publish', channel: 'refresh' });
    expect(session.calls).toContain('publish:refresh');
  });

  it('a malformed message answers with an error, not a throw', async () => {
    const session = recordingSession();
    const shells: ShellHost = { session: () => session };
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

  it('exposes the two application close codes', () => {
    expect(CLOSE_INVALID_TOKEN).toBe(4401);
    expect(CLOSE_SIGNED_OUT).toBe(4403);
  });
});

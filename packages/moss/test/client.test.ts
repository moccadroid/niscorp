import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWire, browserEnv } from '../src/client';
import type { WireEnv } from '../src/client';
import { CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT } from '../src/socket';

// ═══════════════════════════════════════════════════════════════
// The wire — driven headlessly, the way socket.test.ts drives the server:
// a `WireEnv` built on a fake socket and an in-memory token store, injected
// through the wire's own host seam (no global shims — the seam IS the
// product surface a Node/TTY host uses). vitest's fake clock owns reconnect
// scheduling via the global timers the wire calls.
// ═══════════════════════════════════════════════════════════════

// The transport, faked: capture what the wire sends, and let a test drive
// the three inbound events (open, message, close) by hand.
class FakeSocket {
  static instances: FakeSocket[] = [];
  static last(): FakeSocket {
    const s = FakeSocket.instances[FakeSocket.instances.length - 1];
    if (s === undefined) throw new Error('no socket constructed yet');
    return s;
  }
  url: string;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  send(text: string): void {
    this.sent.push(text);
  }
  close(): void {
    this.closed = true;
  }
  // ── test drivers ──
  open(): void {
    this.onopen?.();
  }
  emit(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  serverClose(code: number): void {
    this.onclose?.({ code });
  }
  envelopes(): Record<string, unknown>[] {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

const makeStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

let storage: ReturnType<typeof makeStorage>;

// A test host: FakeSocket transport, in-memory token slot keyed like the
// browser env would key localStorage.
const env = (tokenKey = 'nisc.token'): WireEnv => ({
  tokens: {
    load: () => storage.getItem(tokenKey),
    save: (token) => storage.setItem(tokenKey, token),
    clear: () => storage.removeItem(tokenKey),
  },
  socket: (url) => new FakeSocket(url) as unknown as WebSocket,
  defaultUrl: () => 'ws://default.local/socket',
});

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  storage = makeStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const URL = 'ws://test/socket';

describe('the wire — connect + snapshot', () => {
  it('connects immediately, anonymous when the token slot is empty', () => {
    createWire({ url: URL, env: env() });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.last().url).toBe(URL); // no ?token
  });

  it('falls back to the env defaultUrl when no url is configured', () => {
    createWire({ env: env() });
    expect(FakeSocket.last().url).toBe('ws://default.local/socket');
  });

  it('rides the stored token up on connect', () => {
    storage.setItem('nisc.token', 'tok-1');
    createWire({ url: URL, env: env() });
    expect(FakeSocket.last().url).toContain('?token=tok-1');
  });

  it('honours a custom token slot', () => {
    storage.setItem('my.key', 'tok-2');
    createWire({ url: URL, env: env('my.key') });
    expect(FakeSocket.last().url).toContain('token=tok-2');
  });

  it('frame and render messages accumulate into the snapshot, notifying subscribers', () => {
    const wire = createWire({ url: URL, env: env() });
    let ticks = 0;
    wire.subscribe(() => (ticks += 1));
    FakeSocket.last().emit({ type: 'frame', tree: [{ type: 'text', value: 'hi' }] });
    FakeSocket.last().emit({ type: 'render', canvas: 'main', tree: [{ type: 'text', value: 'row' }] });
    const snap = wire.snapshot();
    expect(snap.frame).toEqual([{ type: 'text', value: 'hi' }]);
    expect(snap.trees.get('main')).toEqual([{ type: 'text', value: 'row' }]);
    expect(ticks).toBe(2);
  });

  it('sends event and publish envelopes on the socket', () => {
    const wire = createWire({ url: URL, env: env() });
    wire.dispatch('main', { type: 'ui:click', ref: 'save' } as never);
    wire.publish('refresh');
    wire.publish('sel', { id: 7 });
    expect(FakeSocket.last().envelopes()).toEqual([
      { type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'save' } },
      { type: 'publish', channel: 'refresh' },
      { type: 'publish', channel: 'sel', payload: { id: 7 } },
    ]);
  });
});

describe('the wire — session lifecycle (become)', () => {
  it('a session grant stores the token and reconnects authenticated, blanking the screen', () => {
    const wire = createWire({ url: URL, env: env() });
    const first = FakeSocket.last();
    first.emit({ type: 'frame', tree: [{ type: 'text', value: 'anon' }] });

    first.emit({ type: 'session', token: 'granted-1' });

    expect(storage.getItem('nisc.token')).toBe('granted-1');
    expect(first.closed).toBe(true);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.last().url).toContain('token=granted-1');
    // a different principal is a different application — the snapshot is blanked
    expect(wire.snapshot().frame).toEqual([]);
    expect(wire.snapshot().trees.size).toBe(0);
  });

  it('SIGNED_OUT (4403) clears the token and reconnects anonymous', () => {
    storage.setItem('nisc.token', 'tok');
    createWire({ url: URL, env: env() });
    expect(FakeSocket.last().url).toContain('token=tok');

    FakeSocket.last().serverClose(CLOSE_SIGNED_OUT);

    expect(storage.getItem('nisc.token')).toBeNull();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.last().url).toBe(URL); // anonymous now
  });

  it('INVALID_TOKEN (4401) drops the stale token and reconnects anonymous — never loops on it', () => {
    storage.setItem('nisc.token', 'stale');
    createWire({ url: URL, env: env() });

    FakeSocket.last().serverClose(CLOSE_INVALID_TOKEN);

    // recovered to anonymous at once, not via a backoff retry with the bad token
    expect(storage.getItem('nisc.token')).toBeNull();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.last().url).toBe(URL);

    // and no scheduled retry ever re-sends the stale token, however long we wait
    vi.advanceTimersByTime(120_000);
    const staleSockets = FakeSocket.instances.filter((s) => s.url.includes('stale'));
    expect(staleSockets).toHaveLength(1); // only the very first connect, and never again
  });
});

describe('the wire — reconnect backoff', () => {
  it('an abnormal close backs off with growing delay, and a healthy open resets it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // delay collapses to ceiling/2, deterministic
    createWire({ url: URL, env: env() });
    expect(FakeSocket.instances).toHaveLength(1);

    // first failure → 1000/2 = 500ms
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(499);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);

    // second consecutive failure backs off further → 2000/2 = 1000ms
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);

    // a connection that opens forgets the backoff — next failure is 500ms again
    FakeSocket.last().open();
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it('dispose stops reconnects and closes the live socket', () => {
    const wire = createWire({ url: URL, env: env() });
    const sock = FakeSocket.last();
    wire.dispose();
    expect(sock.closed).toBe(true);
    // a close arriving after dispose must not schedule a reconnect
    sock.serverClose(1006);
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe('the wire — inbound diagnostics', () => {
  it('surfaces server error frames instead of swallowing them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createWire({ url: URL, env: env() });
    FakeSocket.last().emit({ type: 'error', code: 'no_shell', message: 'This app serves no shell.' });
    expect(warn).toHaveBeenCalledOnce();
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('no_shell');
    expect(line).toContain('This app serves no shell.');
  });

  it('ignores hello/catalog silently (the terminal is grant-blind) but warns on protocol drift', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createWire({ url: URL, env: env() });
    FakeSocket.last().emit({ type: 'hello', principal: null, catalog: { actions: [], hash: 'x' } });
    FakeSocket.last().emit({ type: 'catalog', actions: [], hash: 'y' });
    expect(warn).not.toHaveBeenCalled();

    FakeSocket.last().emit({ type: 'wat' });
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('wat');
  });
});

describe('the wire — connection status', () => {
  it('starts connecting, opens on open, closes on close — notifying subscribers each transition', () => {
    const wire = createWire({ url: URL, env: env() });
    let ticks = 0;
    wire.subscribe(() => (ticks += 1));
    expect(wire.status()).toBe('connecting');

    FakeSocket.last().open();
    expect(wire.status()).toBe('open');
    expect(ticks).toBe(1);

    FakeSocket.last().serverClose(1006);
    expect(wire.status()).toBe('closed');
    expect(ticks).toBe(2);

    // the scheduled retry flips it back to connecting
    vi.advanceTimersByTime(1000);
    expect(wire.status()).toBe('connecting');
    expect(ticks).toBe(3);
  });

  it('dispose reads closed', () => {
    const wire = createWire({ url: URL, env: env() });
    wire.dispose();
    expect(wire.status()).toBe('closed');
  });
});

// browserEnv is browser code — tested against a faked window, the one place
// a global shim is honest (it IS the host this env binds to).
describe('browserEnv — the browser host', () => {
  const g = globalThis as unknown as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it('token in localStorage, url derived from location', () => {
    g.window = { localStorage: storage, location: { protocol: 'https:', host: 'app.example' } };
    const e = browserEnv();
    e.tokens.save('tok');
    expect(storage.getItem('nisc.token')).toBe('tok');
    expect(e.tokens.load()).toBe('tok');
    e.tokens.clear();
    expect(e.tokens.load()).toBeNull();
    expect(e.defaultUrl()).toBe('wss://app.example/socket');
  });

  it('honours a custom tokenKey', () => {
    g.window = { localStorage: storage, location: { protocol: 'http:', host: 'x' } };
    browserEnv({ tokenKey: 'my.key' }).tokens.save('tok-2');
    expect(storage.getItem('my.key')).toBe('tok-2');
  });

  it('survives a storage-less context (private mode) without throwing', () => {
    g.window = { location: { protocol: 'http:', host: 'x' } }; // no localStorage at all
    const e = browserEnv();
    expect(e.tokens.load()).toBeNull();
    e.tokens.save('t');
    e.tokens.clear();
  });
});

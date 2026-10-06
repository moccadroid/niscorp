import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWire, browserEnv } from '../src/client';
import type { WireEnv } from '../src/client';
import { CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SIGNED_OUT, PROTOCOL, offeredToken } from '../src/socket';
import { encodeDelta, frameHash } from '../src/delta';

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
  offered: string[];
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(upgrade: { url: string; offered: string[] }) {
    this.url = upgrade.url;
    this.offered = upgrade.offered;
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
  socket: (upgrade) => new FakeSocket(upgrade) as unknown as WebSocket,
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

// What an upgrade says: where it goes (the url, less the capability params the
// wire adds — protocol, delta) and which credential it carries (the token the
// socket was constructed offering). The assertions below read those two.
const upgrade = (socket: FakeSocket): { target: string; token: string | null } => {
  const parsed = new globalThis.URL(socket.url);
  return { target: `${parsed.protocol}//${parsed.host}${parsed.pathname}`, token: offeredToken(socket.offered) };
};

describe('the wire — connect + snapshot', () => {
  it('connects immediately, anonymous when the token slot is empty', () => {
    createWire({ url: URL, env: env() });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(upgrade(FakeSocket.last())).toEqual({ target: URL, token: null }); // no ?token
  });

  it('falls back to the env defaultUrl when no url is configured', () => {
    createWire({ env: env() });
    expect(upgrade(FakeSocket.last()).target).toBe('ws://default.local/socket');
  });

  it('rides the stored token up on connect', () => {
    storage.setItem('nisc.token', 'tok-1');
    createWire({ url: URL, env: env() });
    expect(upgrade(FakeSocket.last()).token).toBe('tok-1');
  });

  // An address is what a proxy logs. Through a first connect, a sign-in, a
  // dropped connection and a reset, the token is in none of them.
  it('no address it ever connects to carries the token', () => {
    storage.setItem('nisc.token', 'tok-1');
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();
    FakeSocket.last().emit({ type: 'session', token: 'tok-2' });
    FakeSocket.last().open();
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(60_000);
    wire.reset();
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(3);
    expect(FakeSocket.instances.map((socket) => upgrade(socket).token)).toContain('tok-2');
    for (const socket of FakeSocket.instances) expect(socket.url).not.toMatch(/tok-|token/);
  });

  it('honours a custom token slot', () => {
    storage.setItem('my.key', 'tok-2');
    createWire({ url: URL, env: env('my.key') });
    expect(upgrade(FakeSocket.last()).token).toBe('tok-2');
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

  // What this protects is the SHAPE of what goes up the socket. It used to send
  // on a socket nobody had opened, which no browser allows (a connecting
  // WebSocket throws on `send`) — so the socket is opened first, and the test
  // below holds the other half: nothing goes up one that is not.
  it('sends event and publish envelopes on the socket', () => {
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();
    wire.dispatch('main', { type: 'ui:click', ref: 'save' } as never);
    wire.publish('refresh');
    wire.publish('sel', { id: 7 });
    expect(FakeSocket.last().envelopes()).toEqual([
      { type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'save' } },
      { type: 'publish', channel: 'refresh' },
      { type: 'publish', channel: 'sel', payload: { id: 7 } },
    ]);
  });

  // A server-drawn page is on screen before its socket is. A press in that
  // moment is dropped — not sent, not thrown, and not held for later.
  it('drops events and publishes while the socket is not open, and does not replay them', () => {
    const wire = createWire({ url: URL, env: env() });
    wire.dispatch('main', { type: 'ui:click', ref: 'save' } as never);
    wire.publish('refresh');
    expect(FakeSocket.last().envelopes()).toEqual([]);
    FakeSocket.last().open();
    expect(FakeSocket.last().envelopes()).toEqual([]);
    wire.publish('refresh');
    expect(FakeSocket.last().envelopes()).toEqual([{ type: 'publish', channel: 'refresh' }]);
  });

  it('starts from the page’s snapshot when it was drawn for who this terminal is, and names its seed once', () => {
    const drawn = { frame: [{ type: 'text' as const, value: 'page' }], trees: { main: [{ type: 'text' as const, value: 'row' }] }, seed: 'abcdef0123', principal: false };
    const wire = createWire({ url: URL, env: env(), initial: drawn });
    expect(wire.snapshot().frame).toEqual(drawn.frame);
    expect(wire.snapshot().trees.get('main')).toEqual(drawn.trees.main);
    expect(FakeSocket.last().url).toContain('seed=abcdef0123');
    // a later connect is not the page's shell
    FakeSocket.last().serverClose(4403);
    expect(FakeSocket.last().url).not.toContain('seed=');
  });

  it('does not start from a page drawn for somebody else', () => {
    storage.setItem('nisc.token', 'tok');
    const wire = createWire({ url: URL, env: env(), initial: { frame: [{ type: 'text', value: 'lock screen' }], trees: {}, seed: 'abcdef0123', principal: false } });
    expect(wire.snapshot().frame).toEqual([]);
    expect(FakeSocket.last().url).not.toContain('seed=');
  });
});

// ═══════════════════════════════════════════════════════════════
// RESET — the escape from a wedged shell, and the only one that can work.
// The shell is server state keyed by principal, so nothing done on this
// side (drop the token, reload, sign back in) reaches it.
// ═══════════════════════════════════════════════════════════════

describe('the wire — reset', () => {
  it('asks the server on an open socket, keeping the session and the token', () => {
    storage.setItem('nisc.token', 'tok');
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();

    wire.reset();

    expect(FakeSocket.last().envelopes()).toEqual([{ type: 'reset' }]);
    // Not a sign-out and not a reconnect: same socket, same token.
    expect(FakeSocket.instances).toHaveLength(1);
    expect(storage.getItem('nisc.token')).toBe('tok');
  });

  it('on a dead socket it reconnects NOW rather than waiting out the backoff', () => {
    storage.setItem('nisc.token', 'tok');
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();
    FakeSocket.last().serverClose(1006); // an ordinary drop — a retry is scheduled
    expect(wire.status()).toBe('closed');
    expect(FakeSocket.instances).toHaveLength(1); // still waiting on the backoff

    wire.reset();

    // Somebody pressing reset is telling us they are waiting now. Reattaching
    // re-sends the current trees, so jumping the queue costs nothing — and the
    // token rides up, because this is a recovery, not a sign-out.
    expect(FakeSocket.instances).toHaveLength(2);
    expect(upgrade(FakeSocket.last()).token).toBe('tok');
    expect(wire.status()).toBe('connecting');
  });

  it('does nothing after dispose', () => {
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();
    wire.dispose();
    const before = FakeSocket.last().sent.length;
    wire.reset();
    expect(FakeSocket.last().sent).toHaveLength(before);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe('the wire — back', () => {
  it('sends the gesture up, naming no canvas', () => {
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();

    wire.back();

    expect(FakeSocket.last().envelopes()).toEqual([{ type: 'back' }]);
  });

  it('is dropped on a dead socket rather than queued for the reconnect', () => {
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();
    FakeSocket.last().serverClose(1006);

    wire.back();

    // A back pressed during an outage is about a screen the person is no longer
    // being served. Replaying it on reconnect would move them somewhere they
    // asked to go one outage ago.
    expect(FakeSocket.last().envelopes()).toEqual([]);
  });

  it('does nothing after dispose', () => {
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();
    wire.dispose();
    wire.back();
    expect(FakeSocket.last().envelopes()).toEqual([]);
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
    expect(upgrade(FakeSocket.last()).token).toBe('granted-1');
    // a different principal is a different application — the snapshot is blanked
    expect(wire.snapshot().frame).toEqual([]);
    expect(wire.snapshot().trees.size).toBe(0);
  });

  it('SIGNED_OUT (4403) clears the token and reconnects anonymous', () => {
    storage.setItem('nisc.token', 'tok');
    createWire({ url: URL, env: env() });
    expect(upgrade(FakeSocket.last()).token).toBe('tok');

    FakeSocket.last().serverClose(CLOSE_SIGNED_OUT);

    expect(storage.getItem('nisc.token')).toBeNull();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(upgrade(FakeSocket.last())).toEqual({ target: URL, token: null }); // anonymous now
  });

  it('INVALID_TOKEN (4401) drops the stale token and reconnects anonymous — never loops on it', () => {
    storage.setItem('nisc.token', 'stale');
    createWire({ url: URL, env: env() });

    FakeSocket.last().serverClose(CLOSE_INVALID_TOKEN);

    // recovered to anonymous at once, not via a backoff retry with the bad token
    expect(storage.getItem('nisc.token')).toBeNull();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(upgrade(FakeSocket.last())).toEqual({ target: URL, token: null });

    // and no scheduled retry ever re-sends the stale token, however long we wait
    vi.advanceTimersByTime(120_000);
    const staleSockets = FakeSocket.instances.filter((s) => upgrade(s).token === 'stale');
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
// ═══════════════════════════════════════════════════════════════
// FRAME DELTAS, terminal side. The wire either lands on exactly the frame the
// server meant, or it asks for a whole one. There is no third outcome — a
// terminal rendering a frame nobody authored is the failure this layer must
// not have, and the checksum is what rules it out.
// ═══════════════════════════════════════════════════════════════

describe('the wire — frame deltas', () => {
  const render = (tree: unknown[]): string => JSON.stringify({ type: 'render', canvas: 'main', tree });

  it('advertises the capability on the url only when configured', () => {
    createWire({ url: URL, env: env() });
    expect(FakeSocket.last().url).not.toContain('delta=1');

    createWire({ url: URL, env: env(), delta: true });
    expect(FakeSocket.last().url).toContain('delta=1');

    storage.setItem('nisc.token', 'tok-1');
    createWire({ url: URL, env: env(), delta: true });
    expect(upgrade(FakeSocket.last()).token).toBe('tok-1');
    expect(FakeSocket.last().url).toContain('delta=1');
  });

  it('applies a delta against the last render and renders the rebuilt tree', () => {
    const wire = createWire({ url: URL, env: env(), delta: true });
    const socket = FakeSocket.last();
    socket.open();
    const base = render([{ type: 'text', value: 'a long steady line of chrome' }, { type: 'text', value: '1' }]);
    socket.onmessage?.({ data: base });

    const next = render([{ type: 'text', value: 'a long steady line of chrome' }, { type: 'text', value: '2' }]);
    socket.emit({ type: 'render-delta', canvas: 'main', ops: encodeDelta(base, next), hash: frameHash(next) });

    expect(wire.snapshot().trees.get('main')).toEqual((JSON.parse(next) as { tree: unknown[] }).tree);
    expect(socket.envelopes().some((m) => m['type'] === 'resync')).toBe(false);
  });

  it('chains — the rebuilt frame becomes the next delta\'s base', () => {
    const wire = createWire({ url: URL, env: env(), delta: true });
    const socket = FakeSocket.last();
    socket.open();
    let held = render([{ type: 'text', value: 'chrome that never changes at all' }, { type: 'text', value: '0' }]);
    socket.onmessage?.({ data: held });

    for (const n of ['1', '2', '3']) {
      const next = render([{ type: 'text', value: 'chrome that never changes at all' }, { type: 'text', value: n }]);
      socket.emit({ type: 'render-delta', canvas: 'main', ops: encodeDelta(held, next), hash: frameHash(next) });
      held = next;
    }
    expect(wire.snapshot().trees.get('main')).toEqual((JSON.parse(held) as { tree: unknown[] }).tree);
    expect(socket.envelopes().some((m) => m['type'] === 'resync')).toBe(false);
  });

  it('asks to resync when a delta fails its checksum, and renders nothing new', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wire = createWire({ url: URL, env: env(), delta: true });
    const socket = FakeSocket.last();
    socket.open();
    const base = render([{ type: 'text', value: 'a long steady line of chrome' }, { type: 'text', value: '1' }]);
    socket.onmessage?.({ data: base });
    const held = wire.snapshot().trees.get('main');

    const next = render([{ type: 'text', value: 'a long steady line of chrome' }, { type: 'text', value: '2' }]);
    socket.emit({ type: 'render-delta', canvas: 'main', ops: encodeDelta(base, next), hash: frameHash(next) + 1 });

    expect(socket.envelopes().filter((m) => m['type'] === 'resync')).toHaveLength(1);
    expect(wire.snapshot().trees.get('main')).toBe(held); // untouched, not half-applied
  });

  it('asks to resync when a delta arrives with no base to apply it to', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wire = createWire({ url: URL, env: env(), delta: true });
    const socket = FakeSocket.last();
    socket.open();
    socket.emit({ type: 'render-delta', canvas: 'main', ops: [[1, render([])]], hash: frameHash(render([])) });

    expect(socket.envelopes().filter((m) => m['type'] === 'resync')).toHaveLength(1);
    expect(wire.snapshot().trees.get('main')).toBeUndefined();
  });

  it('asks to resync rather than throwing when an op runs past the base', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wire = createWire({ url: URL, env: env(), delta: true });
    const socket = FakeSocket.last();
    socket.open();
    socket.onmessage?.({ data: render([{ type: 'text', value: 'short' }]) });
    socket.emit({ type: 'render-delta', canvas: 'main', ops: [[0, 0, 99999]], hash: 1 });

    expect(socket.envelopes().filter((m) => m['type'] === 'resync')).toHaveLength(1);
    expect(wire.status()).toBe('open'); // it did not take the connection down with it
  });

  // A reconnect is served whole frames from scratch. A base carried across it
  // is a base the server never assumed, and every delta after it would be a
  // silent lie the checksum has to catch — cheaper to never hold one.
  it('drops its bases on reconnect', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    createWire({ url: URL, env: env(), delta: true });
    const first = FakeSocket.last();
    first.open();
    const base = render([{ type: 'text', value: 'a long steady line of chrome' }, { type: 'text', value: '1' }]);
    first.onmessage?.({ data: base });

    first.serverClose(1006);
    vi.advanceTimersByTime(60_000);
    const second = FakeSocket.last();
    expect(second).not.toBe(first);
    second.open();

    const next = render([{ type: 'text', value: 'a long steady line of chrome' }, { type: 'text', value: '2' }]);
    second.emit({ type: 'render-delta', canvas: 'main', ops: encodeDelta(base, next), hash: frameHash(next) });
    expect(second.envelopes().filter((m) => m['type'] === 'resync')).toHaveLength(1);
  });
});

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
    expect(e.tokens.held?.()).toBe(false);
  });

  // The session a browser keeps is in a cookie this page cannot read; the flag
  // beside it is all the page sees, and it is named for the page's own port.
  describe('what the page can see of a session its browser keeps', () => {
    const d = globalThis as unknown as { document?: unknown };
    let visible = '';
    let written: string[] = [];
    beforeEach(() => {
      visible = '';
      written = [];
      d.document = {
        get cookie(): string {
          return visible;
        },
        set cookie(value: string) {
          written.push(value);
        },
      };
    });
    afterEach(() => {
      delete d.document;
    });

    it('`held` follows the flag for this key on this port, and no other', () => {
      g.window = { localStorage: storage, location: { protocol: 'http:', host: 'localhost:5173', port: '5173' } };
      const e = browserEnv();
      expect(e.tokens.held?.()).toBe(false);
      visible = 'theme=dark; nisc.token.3000.held=1; nisc.token.speaker.5173.held=1';
      expect(e.tokens.held?.()).toBe(false);
      expect(browserEnv({ tokenKey: 'nisc.token.speaker' }).tokens.held?.()).toBe(true);
      visible = 'nisc.token.5173.held=1';
      expect(e.tokens.held?.()).toBe(true);
    });

    it('a seat names itself; the default one does not', () => {
      g.window = { localStorage: storage, location: { protocol: 'https:', host: 'app.example', port: '' } };
      expect(browserEnv().tokens.key).toBeUndefined();
      expect(browserEnv({ tokenKey: 'nisc.token.speaker' }).tokens.key).toBe('nisc.token.speaker');
    });

    it('writes the token to no cookie — `cookie: true` no longer keeps a copy script can read', () => {
      g.window = { localStorage: storage, location: { protocol: 'https:', host: 'app.example', port: '' } };
      const e = browserEnv({ cookie: true });
      e.tokens.save('tok');
      e.tokens.load();
      expect(written).toEqual([]);
      // letting go removes the copy an earlier build left, with what is stored
      e.tokens.clear();
      expect(storage.getItem('nisc.token')).toBeNull();
      expect(written).toEqual(['nisc.token=; Path=/; Max-Age=0; SameSite=Lax; Secure']);
    });
  });
});

describe('the wire — protocol', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('says which protocol it speaks on every upgrade', () => {
    createWire({ url: URL, env: env() });
    expect(FakeSocket.last().url).toContain(`protocol=${PROTOCOL}`);
  });

  it('a protocol-mismatch close is terminal: status incompatible, no reconnect', () => {
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().serverClose(CLOSE_PROTOCOL_MISMATCH);
    expect(wire.status()).toBe('incompatible');
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('refuses a server older than it can speak to, then stops', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wire = createWire({ url: URL, env: env() });
    const sock = FakeSocket.last();
    sock.open();
    sock.emit({ type: 'hello', protocol: 0, principal: null, catalog: { actions: [], hash: 'x' } });
    expect(sock.closed).toBe(true);
    expect(String(error.mock.calls[0]?.[0])).toContain('protocol 0');
    sock.serverClose(1005);
    expect(wire.status()).toBe('incompatible');
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

// A host whose browser may keep the session itself (a cookie the page cannot
// read, written by the server's answer to the upgrade). `kept` stands for that
// cookie here; `held` is all the wire ever asks of it.
describe('the wire — on a host whose browser keeps the session', () => {
  let kept = false;
  const host = (key?: string): WireEnv => {
    const plain = env();
    return { ...plain, tokens: { ...plain.tokens, held: () => kept, ...(key !== undefined ? { key } : {}) } };
  };
  const hello = { type: 'hello', protocol: PROTOCOL, principal: 'usr_1', catalog: { actions: [], hash: 'h' } };
  beforeEach(() => {
    kept = false;
  });

  it('a token left in storage is offered once, and let go of when the browser holds the session', () => {
    storage.setItem('nisc.token', 'tok-1');
    createWire({ url: URL, env: host() });
    expect(upgrade(FakeSocket.last()).token).toBe('tok-1');
    kept = true; // the answer to that upgrade wrote the cookie
    FakeSocket.last().open();
    FakeSocket.last().emit(hello);
    expect(storage.getItem('nisc.token')).toBeNull();
    // and it is not offered again: the browser sends the cookie by itself
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(upgrade(FakeSocket.last()).token).toBeNull();
  });

  it('a token it is handed at sign-in is offered, and never stored', () => {
    createWire({ url: URL, env: host() });
    FakeSocket.last().open();
    FakeSocket.last().emit({ type: 'session', token: 'granted-1' });
    expect(upgrade(FakeSocket.last()).token).toBe('granted-1');
    expect(storage.getItem('nisc.token')).toBeNull();
    kept = true;
    FakeSocket.last().open();
    FakeSocket.last().emit(hello);
    expect(storage.getItem('nisc.token')).toBeNull();
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(upgrade(FakeSocket.last()).token).toBeNull();
  });

  it('…unless the browser does not keep it (another origin, cookies refused): then it is stored, as it always was', () => {
    createWire({ url: URL, env: host() });
    FakeSocket.last().open();
    FakeSocket.last().emit({ type: 'session', token: 'granted-1' });
    FakeSocket.last().open();
    FakeSocket.last().emit(hello);
    expect(storage.getItem('nisc.token')).toBe('granted-1');
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(upgrade(FakeSocket.last()).token).toBe('granted-1');
  });

  // The browser may hold a token that still resolves (an app's own provider's
  // is not moss's to revoke), so a terminal that was signed out says so — on
  // every upgrade until the server has heard it.
  it('signed out, it says it is leaving until an upgrade is answered', () => {
    kept = true;
    createWire({ url: URL, env: host() });
    FakeSocket.last().open();
    FakeSocket.last().emit(hello);
    expect(FakeSocket.last().url).not.toContain('leave');
    FakeSocket.last().serverClose(CLOSE_SIGNED_OUT);
    expect(FakeSocket.last().url).toContain('leave=1');
    FakeSocket.last().serverClose(1006); // dropped before it was answered
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.last().url).toContain('leave=1');
    FakeSocket.last().open();
    FakeSocket.last().emit({ ...hello, principal: null });
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.last().url).not.toContain('leave');
  });

  it('a token that was refused is dropped without leaving: whatever the browser holds still speaks', () => {
    storage.setItem('nisc.token', 'stale');
    createWire({ url: URL, env: host() });
    FakeSocket.last().serverClose(CLOSE_INVALID_TOKEN);
    expect(storage.getItem('nisc.token')).toBeNull();
    expect(upgrade(FakeSocket.last()).token).toBeNull();
    expect(FakeSocket.last().url).not.toContain('leave');
  });

  it('a seat names itself in the address, so the server reads that seat’s cookie', () => {
    createWire({ url: URL, env: host('nisc.token.speaker') });
    expect(new globalThis.URL(FakeSocket.last().url).searchParams.get('key')).toBe('nisc.token.speaker');
    createWire({ url: URL, env: host() });
    expect(FakeSocket.last().url).not.toContain('key=');
  });

  it('starts from a page drawn for somebody when the browser holds the session, though the page holds no token', () => {
    const drawn = { frame: [{ type: 'text' as const, value: 'her home' }], trees: {}, principal: true };
    expect(createWire({ url: URL, env: host(), initial: drawn }).snapshot().frame).toEqual([]);
    kept = true;
    expect(createWire({ url: URL, env: host(), initial: drawn }).snapshot().frame).toEqual(drawn.frame);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWire, browserEnv, readDocumentSnapshot } from '../src/client';
import type { WireEnv } from '../src/client';
import { CLOSE_AT_CAPACITY, CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SHELL_FAILED, CLOSE_SIGNED_OUT, ClientMessageSchema, PROTOCOL, encodeDelta, frameHash, offeredToken } from '../src/protocol';

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
  // Everything the wire sends is held to the schema the server parses with.
  send(text: string): void {
    ClientMessageSchema.parse(JSON.parse(text));
    this.sent.push(text);
  }
  close(): void {
    this.closed = true;
  }
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

const upgrade = (socket: FakeSocket): { target: string; token: string | null } => {
  const parsed = new globalThis.URL(socket.url);
  return { target: `${parsed.protocol}//${parsed.host}${parsed.pathname}`, token: offeredToken(socket.offered) };
};

describe('the wire — connect + snapshot', () => {
  it('connects immediately, anonymous when the token slot is empty', () => {
    createWire({ url: URL, env: env() });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(upgrade(FakeSocket.last())).toEqual({ target: URL, token: null });
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

  // The socket is opened first: a connecting WebSocket throws on `send`.
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

describe('the wire — reset', () => {
  it('asks the server on an open socket, keeping the session and the token', () => {
    storage.setItem('nisc.token', 'tok');
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();

    wire.reset();

    expect(FakeSocket.last().envelopes()).toEqual([{ type: 'reset' }]);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(storage.getItem('nisc.token')).toBe('tok');
  });

  it('on a dead socket it reconnects NOW rather than waiting out the backoff', () => {
    storage.setItem('nisc.token', 'tok');
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();
    FakeSocket.last().serverClose(1006);
    expect(wire.status()).toBe('closed');
    expect(FakeSocket.instances).toHaveLength(1);

    wire.reset();

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

  describe('while a connect is in flight', () => {
    const row = (value: string): { type: 'text'; value: string }[] => [{ type: 'text', value }];
    const resetWhileConnecting = (): { wire: ReturnType<typeof createWire>; first: FakeSocket; second: FakeSocket } => {
      const wire = createWire({ url: URL, env: env() });
      const first = FakeSocket.last();
      wire.reset();
      return { wire, first, second: FakeSocket.last() };
    };

    it('lets go of the socket it was waiting on', () => {
      const { first, second } = resetWhileConnecting();
      expect(second).not.toBe(first);
      expect(first.closed).toBe(true);
    });

    it('one socket writes the snapshot: what the other still says is not heard', () => {
      const { wire, first, second } = resetWhileConnecting();
      second.open();
      second.emit({ type: 'render', canvas: 'main', tree: row('from the second') });
      first.open();
      first.emit({ type: 'render', canvas: 'main', tree: row('from the first') });
      expect(wire.snapshot().trees.get('main')).toEqual(row('from the second'));
    });

    it('the other closing is not the connection closing, and schedules no third', () => {
      const { wire, first, second } = resetWhileConnecting();
      second.open();
      first.serverClose(1006);
      expect(wire.status()).toBe('open');
      vi.advanceTimersByTime(120_000);
      expect(FakeSocket.instances).toHaveLength(2);
    });

    it('a sign-out heard on the other signs nobody out', () => {
      storage.setItem('nisc.token', 'tok');
      const { first, second } = resetWhileConnecting();
      second.open();
      first.serverClose(CLOSE_SIGNED_OUT);
      expect(storage.getItem('nisc.token')).toBe('tok');
      expect(FakeSocket.instances).toHaveLength(2);
    });
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
    expect(upgrade(FakeSocket.last())).toEqual({ target: URL, token: null });
  });

  it('INVALID_TOKEN (4401) drops the stale token and reconnects anonymous — never loops on it', () => {
    storage.setItem('nisc.token', 'stale');
    createWire({ url: URL, env: env() });

    FakeSocket.last().serverClose(CLOSE_INVALID_TOKEN);

    expect(storage.getItem('nisc.token')).toBeNull();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(upgrade(FakeSocket.last())).toEqual({ target: URL, token: null });

    vi.advanceTimersByTime(120_000);
    const staleSockets = FakeSocket.instances.filter((s) => upgrade(s).token === 'stale');
    expect(staleSockets).toHaveLength(1);
  });
});

describe('the wire — reconnect backoff', () => {
  it('an abnormal close backs off with growing delay, and a connection that was served a screen resets it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // The delay collapses to ceiling/2, which makes it deterministic
    createWire({ url: URL, env: env() });
    expect(FakeSocket.instances).toHaveLength(1);

    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(499);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);

    FakeSocket.last().open();
    FakeSocket.last().emit({ type: 'frame', tree: [] });
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.instances).toHaveLength(4);
  });

  const refusedWith = (code: number, said: Record<string, unknown>[]): void => {
    const socket = FakeSocket.last();
    socket.open();
    for (const message of said) socket.emit(message);
    socket.serverClose(code);
  };
  const waitsBefore = (connects: number, refuse: () => void): number[] => {
    const waits: number[] = [];
    for (let i = 0; i < connects; i += 1) {
      refuse();
      const before = FakeSocket.instances.length;
      const from = Date.now();
      while (FakeSocket.instances.length === before) vi.advanceTimersToNextTimer();
      waits.push(Date.now() - from);
    }
    return waits;
  };

  it('a connection that is refused at capacity each time is tried again more and more slowly, up to the cap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createWire({ url: URL, env: env() });
    const atCapacity = { type: 'error', code: 'at_capacity', message: 'This server is serving as many terminals with nobody signed in as it is set to. Try again in a moment.' };

    expect(waitsBefore(7, () => refusedWith(CLOSE_AT_CAPACITY, [atCapacity]))).toEqual([500, 1000, 2000, 4000, 8000, 15_000, 15_000]);
  });

  it('so is one whose session the server could not open, though it had said hello', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createWire({ url: URL, env: env() });
    const hello = { type: 'hello', protocol: PROTOCOL, principal: null, catalog: { actions: [], hash: 'h' } };
    const failed = { type: 'error', code: 'session_failed', message: 'The session was refused.' };

    expect(waitsBefore(3, () => refusedWith(CLOSE_SHELL_FAILED, [hello, failed]))).toEqual([500, 1000, 2000]);
  });

  it('a connection that was served a screen and then dropped is tried again after the first, short wait, however often it had been refused before', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createWire({ url: URL, env: env() });
    const atCapacity = { type: 'error', code: 'at_capacity', message: 'no place' };
    waitsBefore(4, () => refusedWith(CLOSE_AT_CAPACITY, [atCapacity]));

    const served = [{ type: 'hello', protocol: PROTOCOL, principal: null, catalog: { actions: [], hash: 'h' } }, { type: 'frame', tree: [] }];
    expect(waitsBefore(1, () => refusedWith(1006, served))).toEqual([500]);
  });

  it('dispose stops reconnects and closes the live socket', () => {
    const wire = createWire({ url: URL, env: env() });
    const sock = FakeSocket.last();
    wire.dispose();
    expect(sock.closed).toBe(true);
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

describe('the wire — what the server sends is parsed', () => {
  const row = { type: 'text', value: 'row' };
  const shown = (): { wire: ReturnType<typeof createWire>; socket: FakeSocket; warn: ReturnType<typeof vi.spyOn> } => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const wire = createWire({ url: URL, env: env(), delta: true });
    const socket = FakeSocket.last();
    socket.open();
    socket.emit({ type: 'frame', tree: [row] });
    socket.emit({ type: 'render', canvas: 'main', tree: [row] });
    return { wire, socket, warn };
  };

  it.each([
    ['a render whose tree is not a list', { type: 'render', canvas: 'main', tree: 'rows' }],
    ['a render with a node of no kind nova has', { type: 'render', canvas: 'main', tree: [{ type: 'table', rows: [] }] }],
    ['a render with a broken node deep inside a good one', { type: 'render', canvas: 'main', tree: [{ type: 'component', name: 'Row', props: {}, children: [{ type: 'fragment', children: [{ type: 'text' }] }] }] }],
    ['a render with a node carrying a field no node has', { type: 'render', canvas: 'main', tree: [{ type: 'text', value: 'a', ink: 'red' }] }],
    ['a render that names no canvas', { type: 'render', tree: [row] }],
    ['a render with a field render does not have', { type: 'render', canvas: 'main', tree: [row], also: 'aside' }],
    ['a frame whose tree is not a tree', { type: 'frame', tree: [{ type: 'text', value: 7 }] }],
  ])('%s is said and not put on the screen', (_label, message) => {
    const { wire, socket, warn } = shown();
    const held = wire.snapshot();
    let ticks = 0;
    wire.subscribe(() => (ticks += 1));
    socket.emit(message);
    expect(wire.snapshot()).toBe(held);
    expect(ticks).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain(message.type);
    expect(wire.status()).toBe('open');
  });

  it('text that is not JSON is said and dropped, not thrown into the socket', () => {
    const { wire, socket, warn } = shown();
    const held = wire.snapshot();
    expect(() => socket.onmessage?.({ data: '{"type":"render","canvas":"main"' })).not.toThrow();
    expect(wire.snapshot()).toBe(held);
    expect(warn).toHaveBeenCalledOnce();
    expect(wire.status()).toBe('open');
  });

  it('what it says of a message it cannot read is its type, never its text', () => {
    const { socket, warn } = shown();
    socket.emit({ type: 'session', token: 'st_SECRET', principal: 'usr_1' });
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('session');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('st_SECRET');
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it.each([
    ['names neither a token nor a sealed sign-in', { type: 'session' }],
    ['carries a token that is not text', { type: 'session', token: 7 }],
  ])('a session message that %s signs nobody in', (_label, message) => {
    const { socket, warn } = shown();
    socket.emit(message);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('a delta that rebuilds, to the checksum, something that is not a render is not put on the screen: it asks for whole frames', () => {
    const { wire, socket } = shown();
    const held = wire.snapshot();
    const base = JSON.stringify({ type: 'render', canvas: 'main', tree: [row] });
    const next = JSON.stringify({ type: 'render', canvas: 'main', tree: [{ type: 'table', rows: [] }] });
    socket.emit({ type: 'render-delta', canvas: 'main', ops: encodeDelta(base, next), hash: frameHash(next) });
    expect(wire.snapshot()).toBe(held);
    expect(socket.envelopes().filter((m) => m['type'] === 'resync')).toHaveLength(1);
  });

  it('a delta whose ops are not ops is not applied', () => {
    const { wire, socket, warn } = shown();
    const held = wire.snapshot();
    socket.emit({ type: 'render-delta', canvas: 'main', ops: [[2, 'x'], 'copy'], hash: 1 });
    expect(wire.snapshot()).toBe(held);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('a hello that names no protocol is a server from before the question: it speaks 1, and this terminal stops', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wire = createWire({ url: URL, env: env() });
    const socket = FakeSocket.last();
    socket.open();
    socket.emit({ type: 'hello', principal: null, catalog: { actions: [], hash: 'x' } });
    expect(String(error.mock.calls[0]?.[0])).toContain('protocol 1');
    socket.serverClose(1005);
    expect(wire.status()).toBe('incompatible');
  });
});

describe('readDocumentSnapshot', () => {
  const carrying = (snapshot: unknown): Pick<Document, 'getElementById'> => ({ getElementById: () => ({ textContent: typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot) }) as HTMLElement });
  const drawn = { frame: [{ type: 'text', value: 'page' }], trees: { main: [{ type: 'component', name: 'Row', props: { gap: 8 }, children: [{ type: 'text', value: 'row' }], ref: 'r1' }] }, principal: false };

  it('reads what the server wrote, with what it says about itself', () => {
    expect(readDocumentSnapshot(carrying(drawn))).toEqual(drawn);
    const whole = { ...drawn, seed: 'abcdef0123', path: '/docs/intro', live: false };
    expect(readDocumentSnapshot(carrying(whole))).toEqual(whole);
  });

  it.each([
    ['no snapshot at all', ''],
    ['text that is not JSON', '{"frame":['],
    ['a frame that is not a tree', { ...drawn, frame: [{ type: 'table' }] }],
    ['a canvas whose tree is not a tree', { ...drawn, trees: { main: [{ type: 'text', value: 7 }] } }],
    ['trees that are a list', { ...drawn, trees: [] }],
    ['nothing said of who it was drawn for', { frame: drawn.frame, trees: drawn.trees }],
    ['a seed that is not text', { ...drawn, seed: 7 }],
    ['a field a snapshot does not have', { ...drawn, settled: true }],
  ])('a page with %s is a page that was not drawn', (_label, snapshot) => {
    expect(readDocumentSnapshot(carrying(snapshot))).toBeUndefined();
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
    expect(wire.snapshot().trees.get('main')).toBe(held);
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
    expect(wire.status()).toBe('open');
  });

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
    g.window = { location: { protocol: 'http:', host: 'x' } };
    const e = browserEnv();
    expect(e.tokens.load()).toBeNull();
    e.tokens.save('t');
    e.tokens.clear();
    expect(e.tokens.held?.()).toBe(false);
  });

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

  it('a reset out of incompatible that reaches a server it can speak to is a connection like any other: a drop is retried', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hello = { type: 'hello', principal: null, catalog: { actions: [], hash: 'x' } };
    const wire = createWire({ url: URL, env: env() });
    FakeSocket.last().open();
    FakeSocket.last().emit({ ...hello, protocol: 0 });
    FakeSocket.last().serverClose(1005);
    expect(wire.status()).toBe('incompatible');

    wire.reset();
    FakeSocket.last().open();
    FakeSocket.last().emit({ ...hello, protocol: PROTOCOL });
    expect(wire.status()).toBe('open');

    FakeSocket.last().serverClose(1006);
    expect(wire.status()).toBe('closed');
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(3);
    expect(wire.status()).toBe('connecting');
  });
});

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
    kept = true;
    FakeSocket.last().open();
    FakeSocket.last().emit(hello);
    expect(storage.getItem('nisc.token')).toBeNull();
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

  it('signed out, it says it is leaving until an upgrade is answered', () => {
    kept = true;
    createWire({ url: URL, env: host() });
    FakeSocket.last().open();
    FakeSocket.last().emit(hello);
    expect(FakeSocket.last().url).not.toContain('leave');
    FakeSocket.last().serverClose(CLOSE_SIGNED_OUT);
    expect(FakeSocket.last().url).toContain('leave=1');
    FakeSocket.last().serverClose(1006);
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

  it('a sign-in handed to it sealed is offered back as it is — no token, nothing stored — until an upgrade is answered', () => {
    createWire({ url: URL, env: host() });
    expect(FakeSocket.last().url).toContain('sealed=1');
    FakeSocket.last().open();
    FakeSocket.last().emit({ type: 'session', sealed: 'c2VhbGVk' });
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.last().offered).toEqual(['nisc', 'nisc.sealed.c2VhbGVk']);
    expect(upgrade(FakeSocket.last()).token).toBeNull();
    expect(storage.getItem('nisc.token')).toBeNull();
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.last().offered).toEqual(['nisc', 'nisc.sealed.c2VhbGVk']);
    kept = true;
    FakeSocket.last().open();
    FakeSocket.last().emit(hello);
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.last().offered).toEqual(['nisc']);
    expect(storage.getItem('nisc.token')).toBeNull();
  });

  it('a sealed sign-in that is refused is not offered again', () => {
    createWire({ url: URL, env: host() });
    FakeSocket.last().open();
    FakeSocket.last().emit({ type: 'session', sealed: 'c2VhbGVk' });
    expect(FakeSocket.last().offered).toEqual(['nisc', 'nisc.sealed.c2VhbGVk']);
    FakeSocket.last().serverClose(CLOSE_INVALID_TOKEN);
    expect(FakeSocket.last().offered).toEqual(['nisc']);
    const sockets = FakeSocket.instances.length;
    FakeSocket.last().open();
    FakeSocket.last().emit({ ...hello, principal: null });
    expect(FakeSocket.instances).toHaveLength(sockets);
  });

  it('a host that keeps its own token does not ask to be handed one sealed', () => {
    createWire({ url: URL, env: env() });
    expect(FakeSocket.last().url).not.toContain('sealed');
  });

  it('told its browser does not keep the seal, it stops asking — and the next sign-in reaches it as a token', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createWire({ url: URL, env: host() });
    FakeSocket.last().open();
    FakeSocket.last().emit({ type: 'error', code: 'seal_not_kept', message: 'not kept' });
    FakeSocket.last().emit({ ...hello, principal: null });
    FakeSocket.last().serverClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.last().url).not.toContain('sealed');
    expect(warned).toHaveBeenCalled();
  });
});

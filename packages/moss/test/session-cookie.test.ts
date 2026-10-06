import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { WebSocket as Ws } from 'ws';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { defineApp } from '../src/app';
import { createServer } from '../src/server';
import type { MossServer } from '../src/server';
import type { NiscRuntime } from '../src/runtime';
import { attachSocket } from '../src/node';
import { mintSession, sessionOf } from '../src/sessions';
import { renderDocument } from '../src/document';
import { isOwnOrigin, openSealed, sealSession, sessionCookies } from '../src/session-cookie';
import { offerToken, PROTOCOL } from '../src/socket';
import { browserEnv, createWire } from '../src/client';
import type { Wire } from '../src/client';

// ═══════════════════════════════════════════════════════════════
// A BROWSER'S SESSION, KEPT WHERE ITS PAGE CANNOT READ IT — the real server, a
// real socket, the real wire and the real `browserEnv()`, with a stand-in for
// the one thing a test cannot reach: a browser's cookie jar, and the headers a
// browser adds to a request by itself (Origin, Cookie).
// ═══════════════════════════════════════════════════════════════

const until = (holds: () => boolean, why: string, ms = 8000): Promise<void> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => (holds() ? resolve() : Date.now() - started > ms ? reject(new Error(`timed out: ${why}`)) : void setTimeout(tick, 15));
    tick();
  });

// A lock screen for nobody, a home for a member. Signing in names who; both
// are functions, so both happen over the socket.
const appWith = (mint: (runtime: NiscRuntime, who: string) => string | Promise<string>) =>
  defineApp({
    charter: { public: ['login'], member: ['home'] },
    assignments: { ada: ['member'], bea: ['member'] },
    actions: {
      login: { id: 'login', data: { who: '' }, layout: { component: 'Button', ref: 'enter' }, endpoints: { enter: { fn: 'auth.enter' } }, triggers: [{ event: 'ui:click', ref: 'enter', do: [{ set: 'who', value: '@event.payload' }, { call: 'enter' }] }] },
      home: { id: 'home', data: {}, layout: { component: 'Button', ref: 'leave' }, endpoints: { leave: { fn: 'auth.leave' } }, triggers: [{ event: 'ui:click', ref: 'leave', do: [{ call: 'leave' }] }] },
    },
    shell: { canvases: [{ id: 'main', initial: ['home', 'login'] }] },
    functions: (session) => ({
      'auth.enter': async (data) => (session.grant(await mint(session.runtime, String(data['who']))), true),
      'auth.leave': async () => (await session.revoke(), true),
    }),
  });

const closers: (() => void)[] = [];
afterAll(() => {
  for (const close of closers) close();
});
const listening = async (server: MossServer): Promise<string> => {
  const http = serve({ fetch: server.fetch, port: 0, hostname: '127.0.0.1' });
  attachSocket(http, server.socket);
  await new Promise<void>((ready) => http.once('listening', () => ready()));
  closers.push(() => (http.close(), server.close()));
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
};

let server: MossServer;
let pool: ReturnType<typeof createPglitePool>;
let base = '';
let port = '';
beforeAll(async () => {
  pool = createPglitePool(new PGlite());
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // revalidation off: whatever closes a socket here is not the timer
  server = await createServer(appWith((runtime, who) => mintSession(runtime.pool, who, 60_000)), { pool, db: pool, session: 'sessions', sessionRevalidateMs: 0 });
  quiet.mockRestore();
  base = await listening(server);
  port = new URL(base).port;
});

// The browser: a jar that knows which cookies script may see and which it may
// not touch, storage, and a `WebSocket` that sends what a browser sends and
// keeps what the answer to its upgrade sets.
type Jar = Map<string, { value: string; attributes: string[] }>;
const browser = (at = base, refuses: (name: string) => boolean = () => false): { jar: Jar; storage: Map<string, string>; addresses: string[]; offers: string[][]; handed: string[]; cookieHeader: () => string } => {
  const jar: Jar = new Map();
  const storage = new Map<string, string>();
  const addresses: string[] = [];
  const offers: string[][] = [];
  // every frame the page's sockets were sent: all its script could have read off them
  const handed: string[] = [];
  const take = (setCookie: string, fromScript: boolean): void => {
    const [pair = '', ...attributes] = setCookie.split(';').map((part) => part.trim());
    const name = pair.slice(0, pair.indexOf('='));
    const value = pair.slice(pair.indexOf('=') + 1);
    // script can neither set a cookie it could not read, nor replace one
    if (fromScript && (attributes.includes('HttpOnly') || jar.get(name)?.attributes.includes('HttpOnly') === true)) return;
    if (value === '' || attributes.includes('Max-Age=0')) jar.delete(name);
    else if (!refuses(name)) jar.set(name, { value, attributes });
  };
  const cookieHeader = (): string => [...jar].map(([name, cookie]) => `${name}=${cookie.value}`).join('; ');
  vi.stubGlobal('window', {
    location: { protocol: 'http:', host: new URL(at).host, port: new URL(at).port },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value), removeItem: (key: string) => void storage.delete(key) },
  });
  vi.stubGlobal('document', {
    get cookie(): string {
      return [...jar].filter(([, cookie]) => !cookie.attributes.includes('HttpOnly')).map(([name, cookie]) => `${name}=${cookie.value}`).join('; ');
    },
    set cookie(written: string) {
      take(written, true);
    },
  });
  vi.stubGlobal('WebSocket', function PageSocket(url: string, offered: string[]) {
    addresses.push(url);
    offers.push(offered);
    const socket = new Ws(url, offered, { headers: { origin: at, ...(jar.size > 0 ? { cookie: cookieHeader() } : {}) } });
    socket.on('upgrade', (answer) => {
      for (const setCookie of answer.headers['set-cookie'] ?? []) take(setCookie, false);
    });
    socket.on('message', (data) => void handed.push(String(data)));
    return socket;
  });
  return { jar, storage, addresses, offers, handed, cookieHeader };
};

const wires: Wire[] = [];
afterEach(() => {
  for (const wire of wires.splice(0)) wire.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
// loading the page: moss's own terminal on the browser's own env, in a seat or not
const load = (seat?: string): Wire => (wires.push(createWire({ env: browserEnv(seat === undefined ? {} : { tokenKey: `nisc.token.${seat}` }) })), wires[wires.length - 1] as Wire);
const shows = (wire: Wire, ref: string): boolean => JSON.stringify(wire.snapshot().trees.get('main') ?? []).includes(`"${ref}"`);
const signIn = async (wire: Wire, who: string): Promise<void> => {
  await until(() => shows(wire, 'enter'), 'the lock screen');
  wire.dispatch('main', { type: 'ui:click', ref: 'enter', payload: who });
  await until(() => shows(wire, 'leave'), `${who}’s home`);
};

describe('a browser on the app’s own page', () => {
  it('signs in over the socket: the browser holds the session where script cannot read it, and the page stores nothing', async () => {
    const page = browser();
    const first = load();
    await signIn(first, 'ada');

    const kept = page.jar.get(`nisc.token.${port}`);
    expect(await sessionOf(pool, decodeURIComponent(kept?.value ?? ''))).toBe('ada');
    expect(kept?.attributes).toEqual(expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/']));
    // kept for as long as the session resolves (a minute, here)
    expect(Number(kept?.attributes.find((attribute) => attribute.startsWith('Max-Age='))?.slice(8))).toBeGreaterThan(50);
    expect(page.storage.size).toBe(0);
    // all script can see of it: a flag, with no secret in it
    expect(document.cookie).toBe(`nisc.token.${port}.held=1`);
    for (const address of page.addresses) expect(address).not.toMatch(/st_|token=/);
    // THE PAGE WAS NEVER HANDED THE TOKEN: the sign-in reached it sealed, and it offered that back as it was
    const granted = page.handed.map((frame) => JSON.parse(frame) as Record<string, unknown>).find((frame) => frame['type'] === 'session');
    expect(Object.keys(granted ?? {})).toEqual(['type', 'sealed']);
    expect(page.handed.join('')).not.toContain('st_');
    expect(page.offers.flat().some((entry) => entry.startsWith('nisc.token.'))).toBe(false);
    expect(page.offers.flat()).toContain(`nisc.sealed.${String(granted?.['sealed'])}`);
    // …sealed with a key in a cookie script cannot read, which rides the socket's path and no other
    expect(page.jar.get('nisc.seal')?.attributes).toEqual(expect.arrayContaining(['HttpOnly', 'Path=/socket', 'SameSite=Lax']));

    // a reload: a new page, holding nothing, offering nothing — and signed in
    first.dispose();
    const reloaded = load();
    await until(() => shows(reloaded, 'leave'), 'her home again');
    expect(page.offers[page.offers.length - 1]).toEqual(offerToken(null));
  });

  it('a token an earlier build left in storage, and its script-readable copy, are moved — nobody is signed out, and both are gone', async () => {
    const page = browser();
    const token = await mintSession(pool, 'ada', 60_000);
    page.storage.set('nisc.token', token);
    page.jar.set('nisc.token', { value: token, attributes: ['Path=/', 'SameSite=Lax'] });
    const wire = load();
    await until(() => shows(wire, 'leave'), 'her home, with no lock screen first');
    await until(() => page.storage.size === 0, 'storage let go of');
    expect(page.jar.has('nisc.token')).toBe(false);
    expect(page.jar.get(`nisc.token.${port}`)).toMatchObject({ value: token, attributes: expect.arrayContaining(['HttpOnly']) });
  });

  it('signing out takes the cookie back: a reload is the lock screen', async () => {
    const page = browser();
    const wire = load();
    await signIn(wire, 'ada');
    const held = decodeURIComponent(page.jar.get(`nisc.token.${port}`)?.value ?? '');
    wire.dispatch('main', { type: 'ui:click', ref: 'leave' });
    await until(() => shows(wire, 'enter'), 'the lock screen');
    expect([...page.jar.keys()]).toEqual(['nisc.seal']); // a key, and nothing it opens
    expect(await sessionOf(pool, held)).toBeNull();
    wire.dispose();
    const reloaded = load();
    await until(() => shows(reloaded, 'enter'), 'still the lock screen');
  });

  it('two people, each in a seat, on one origin in one browser', async () => {
    const page = browser();
    await signIn(load('speaker'), 'ada');
    await signIn(load('stage'), 'bea');
    const inSeat = (seat: string): Promise<string | null> => sessionOf(pool, decodeURIComponent(page.jar.get(`nisc.token.${seat}.${port}`)?.value ?? ''));
    expect([await inSeat('speaker'), await inSeat('stage')]).toEqual(['ada', 'bea']);
    // each comes back as itself; a terminal in no seat is nobody
    for (const wire of wires.splice(0)) wire.dispose();
    const speaker = load('speaker');
    const stage = load('stage');
    const noSeat = load();
    await until(() => shows(speaker, 'leave') && shows(stage, 'leave') && shows(noSeat, 'enter'), 'each seat as itself');
    expect(page.addresses.filter((address) => address.includes('key=nisc.token.speaker')).length).toBeGreaterThan(0);
  });

  it('the page is drawn for her from the same cookie — given the host it was asked at', async () => {
    const page = browser();
    await signIn(load(), 'ada');
    const template = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
    const drawn = await renderDocument({ server, template, request: { path: '/', cookie: page.cookieHeader(), host: new URL(base).host }, draw: () => '' });
    expect(drawn.principal).toBe('ada');
    expect(drawn.headers['cache-control']).toBe('private, no-store');
    expect(drawn.headers['set-cookie']).toBeUndefined();
  });

  // What the page was handed at sign-in, in somebody else's hands: without
  // this browser's seal it opens nothing, wherever it is offered from.
  it('what the page was handed at sign-in signs nobody else in', async () => {
    const page = browser();
    const lockScreen = load();
    await until(() => shows(lockScreen, 'enter'), 'the lock screen');
    // the sign-in is taken off the socket before the page can offer it back
    const taken = new Promise<string>((resolve) => {
      const watch = setInterval(() => {
        const granted = page.handed.map((frame) => JSON.parse(frame) as { type: string; sealed?: string }).find((frame) => frame.type === 'session');
        if (granted?.sealed !== undefined) (clearInterval(watch), resolve(granted.sealed));
      }, 5);
    });
    lockScreen.dispatch('main', { type: 'ui:click', ref: 'enter', payload: 'ada' });
    const sealed = await taken;
    const elsewhere = (headers: Record<string, string>): Promise<{ principal: unknown; errors: string[] }> =>
      new Promise((resolve) => {
        const errors: string[] = [];
        const socket = new Ws(`${base.replace('http', 'ws')}/socket?protocol=${PROTOCOL}&sealed=1`, offerToken(null, sealed), { headers });
        socket.on('message', (data) => {
          const frame = JSON.parse(String(data)) as { type: string; principal?: unknown; code?: string };
          if (frame.type === 'error') errors.push(frame.code ?? '');
          if (frame.type === 'hello') setTimeout(() => (resolve({ principal: frame.principal, errors }), socket.close()), 50);
        });
      });
    // another machine, saying the origin the app expects, holding no seal
    expect(await elsewhere({ origin: base })).toEqual({ principal: null, errors: ['seal_not_kept'] });
    // another browser, with a seal of its own
    expect(await elsewhere({ origin: base, cookie: 'nisc.seal=c29tZWJvZHktZWxzZXMtc2VhbA' })).toEqual({ principal: null, errors: [] });
    // and from another origin, nothing is opened whatever is sent
    expect(await elsewhere({ origin: 'http://127.0.0.1:1', cookie: page.cookieHeader() })).toEqual({ principal: null, errors: [] });
  });

  // A browser that does not keep the seal could never open a sealed sign-in.
  // It finds out once, and is handed the next one as a token.
  it('a browser that does not keep the seal: one sign-in comes to nothing, and the next one signs in', async () => {
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const page = browser(base, (name) => name === 'nisc.seal');
    const wire = load();
    await until(() => shows(wire, 'enter'), 'the lock screen');
    wire.dispatch('main', { type: 'ui:click', ref: 'enter', payload: 'ada' });
    await until(() => page.handed.some((frame) => frame.includes('seal_not_kept')), 'being told');
    await until(() => shows(wire, 'enter'), 'the lock screen again');
    wire.dispatch('main', { type: 'ui:click', ref: 'enter', payload: 'ada' });
    await until(() => shows(wire, 'leave'), 'her home');
    expect(await sessionOf(pool, decodeURIComponent(page.jar.get(`nisc.token.${port}`)?.value ?? ''))).toBe('ada');
    // it stopped asking: the address it came back on names no `sealed`
    expect(page.addresses[page.addresses.length - 1]).not.toContain('sealed');
    quiet.mockRestore();
  });

  it('a terminal that is not a page of the app is handed the token itself, as it always was', async () => {
    const frames: Record<string, unknown>[] = [];
    const socket = new Ws(`${base.replace('http', 'ws')}/socket?protocol=${PROTOCOL}`, offerToken(null));
    socket.on('message', (data) => void frames.push(JSON.parse(String(data)) as Record<string, unknown>));
    await until(() => frames.some((frame) => frame['type'] === 'render'), 'the lock screen');
    socket.send(JSON.stringify({ type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'enter', payload: 'ada' } }));
    await until(() => frames.some((frame) => frame['type'] === 'session'), 'the sign-in');
    const granted = frames.find((frame) => frame['type'] === 'session');
    expect(await sessionOf(pool, String(granted?.['token']))).toBe('ada');
    socket.close();
  });

  it('a page on another origin, sent with everything her browser holds, is nobody', async () => {
    const page = browser();
    await signIn(load(), 'ada');
    const served = await new Promise<unknown>((resolve) => {
      const socket = new Ws(`${base.replace('http', 'ws')}/socket?protocol=${PROTOCOL}`, offerToken(null), { headers: { origin: 'http://127.0.0.1:1', cookie: page.cookieHeader() } });
      socket.on('message', (data) => {
        const frame = JSON.parse(String(data)) as { type: string; principal?: unknown };
        if (frame.type === 'hello') (resolve(frame.principal), socket.close());
      });
    });
    expect(served).toBeNull();
  });
});

// moss revokes its own credential at sign-out; an app's own provider's token
// is the app's to revoke, and may go on resolving. The browser must still let
// go of it.
describe('under an app’s own identity provider', () => {
  it('signing out leaves a token that still resolves — and the browser no longer holds it', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const own = await createServer(appWith((_runtime, who) => `idp.${who}`), { pool, db: pool, session: (token) => (token.startsWith('idp.') ? token.slice(4) : null), sessionRevalidateMs: 0 });
    quiet.mockRestore();
    const at = await listening(own);
    const page = browser(at);
    const wire = load();
    await signIn(wire, 'ada');
    // the provider does not say how long its token lasts: kept until the browser closes
    expect(page.jar.get(`nisc.token.${new URL(at).port}`)).toMatchObject({ value: 'idp.ada', attributes: expect.not.arrayContaining([expect.stringMatching(/^Max-Age/)]) });
    wire.dispatch('main', { type: 'ui:click', ref: 'leave' });
    await until(() => shows(wire, 'enter'), 'the lock screen');
    expect(await own.principalOf('idp.ada')).toBe('ada');
    expect([...page.jar.keys()]).toEqual(['nisc.seal']);
    // and the provider's token never reached the page either
    expect(page.handed.join('')).not.toContain('idp.ada');
    wire.dispose();
    const reloaded = load();
    await until(() => shows(reloaded, 'enter'), 'still the lock screen');
  });
});

describe('sessionCookies — for a sign-in the app answers over HTTP', () => {
  it('over https: a name only this host can set, Secure, unreadable to script — and a flag that is readable', () => {
    expect(sessionCookies('https://app.example.com', 'st_abc', { lastsMs: 90_500 })).toEqual([
      '__Host-nisc.token=st_abc; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=90',
      'nisc.token.held=1; Path=/; SameSite=Lax; Secure; Max-Age=90',
    ]);
  });

  it('in a seat, on a port, over plain http', () => {
    expect(sessionCookies('http://localhost:5197', 'a b;c', { key: 'nisc.token.speaker' })).toEqual([
      'nisc.token.speaker.5197=a%20b%3Bc; HttpOnly; Path=/; SameSite=Lax',
      'nisc.token.speaker.5197.held=1; Path=/; SameSite=Lax',
    ]);
  });

  it('taking it back', () => {
    expect(sessionCookies('https://app.example.com', null)).toEqual(['__Host-nisc.token=; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=0', 'nisc.token.held=; Path=/; SameSite=Lax; Secure; Max-Age=0']);
  });

  // A link opened from a mail, a provider's callback: a page request, which
  // names no origin. Where it was addressed, and how a proxy says it arrived.
  it.each([
    ['a request that says its origin', new Request('http://moss:8787/api/auth/redeem', { method: 'POST', headers: { origin: 'https://app.example.com', host: 'moss:8787' } }), '__Host-nisc.token'],
    ['a page request behind a proxy that ends TLS', new Request('http://app.example.com/login', { headers: { host: 'app.example.com', 'x-forwarded-proto': 'https' } }), '__Host-nisc.token'],
    ['a page request straight to a dev server', new Request('http://localhost:5197/login', { headers: { host: 'localhost:5197' } }), 'nisc.token.5197'],
  ])('given %s', (_label, request, name) => {
    expect(sessionCookies(request, 'st_abc')[0]?.split('=')[0]).toBe(name);
  });
});

describe('isOwnOrigin', () => {
  it.each([
    ['the page and the server are one name', 'https://app.example.com', 'app.example.com', [], true],
    ['…on a port', 'http://localhost:5173', 'localhost:5173', [], true],
    ['…whatever the case', 'https://App.Example.com', 'APP.example.com', [], true],
    ['a sibling subdomain', 'https://evil.example.com', 'app.example.com', [], false],
    ['another port on the same host', 'http://localhost:5174', 'localhost:5173', [], false],
    ['an opaque origin', 'null', 'app.example.com', [], false],
    ['no origin at all', null, 'app.example.com', [], false],
    ['a proxy rewrote Host, and the deployment lists where it is served', 'https://app.example.com', 'moss:8787', ['https://app.example.com'], true],
    ['listing one origin does not admit its sibling', 'https://evil.example.com', 'moss:8787', ['https://app.example.com'], false],
    ['…nor the same host over another scheme', 'http://app.example.com', 'moss:8787', ['https://app.example.com'], false],
  ] as const)('%s', (_label, origin, host, listed, own) => {
    expect(isOwnOrigin(origin, host, listed)).toBe(own);
  });
});

describe('the seal', () => {
  it('opens what was sealed with it, and nothing else does', async () => {
    const sealed = await sealSession('this-browsers-seal', 'st_abc');
    expect(sealed).toMatch(/^[\w-]+$/); // a legal subprotocol, as it has to be offered
    expect(sealed).not.toContain('st_abc');
    expect(await openSealed('this-browsers-seal', sealed)).toBe('st_abc');
    expect(await openSealed('another-browsers-seal', sealed)).toBeNull();
  });

  it('a sealed sign-in that was altered, or is not one, opens nothing', async () => {
    const sealed = await sealSession('seal', 'st_abc');
    const altered = `${sealed.slice(0, -2)}${sealed.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(await openSealed('seal', altered)).toBeNull();
    expect(await openSealed('seal', 'not-sealed-at-all')).toBeNull();
    expect(await openSealed('seal', '')).toBeNull();
  });

  it('is good for as long as it takes to come back, and no longer', async () => {
    expect(await openSealed('seal', await sealSession('seal', 'st_abc', 1_000))).toBe('st_abc');
    expect(await openSealed('seal', await sealSession('seal', 'st_abc', -1))).toBeNull();
  });

  it('two sealings of one token are not the same bytes', async () => {
    expect(await sealSession('seal', 'st_abc')).not.toBe(await sealSession('seal', 'st_abc'));
  });
});

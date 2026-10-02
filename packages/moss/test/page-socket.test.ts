import { describe, it, expect, beforeEach } from 'vitest';
import type { ActionDefinition } from '@niscorp/nova';
import type { ScopePolicy } from '@niscorp/vex';
import { createShellHost } from '../src/shells';
import type { ShellHostContext } from '../src/shells';
import { createSocket } from '../src/socket';
import type { Connection } from '../src/socket';
import { createPageRouter } from '../src/pages';
import { createWire } from '../src/client';
import type { WireEnv } from '../src/client';
import type { NiscApp, PageManifest } from '../src/app';

// ═══════════════════════════════════════════════════════════════
// A page's terminal, over the socket: the path it names decides which shell it
// is served, and a page with nothing left to happen is served none at all.
// ═══════════════════════════════════════════════════════════════

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

const search: ActionDefinition = { id: 'search', data: { q: '', topic: '' }, layout: { component: 'Input', model: '$.q' } };
const counter: ActionDefinition = { id: 'counter', data: { n: 0 }, layout: { component: 'Button', ref: 'bump' }, triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }] };
const policy: ScopePolicy = { default: 'deny', entities: {} };

const page: PageManifest = { path: '/find/:topic', params: 'main', canvases: [{ id: 'main', initial: 'search' }] };
const app = { charter: {}, assignments: {}, actions: { search, counter }, shell: { canvases: [{ id: 'main', initial: 'counter' }] }, pages: { find: page } } as unknown as NiscApp;

const context: ShellHostContext = {
  app,
  catalogFor: () => ({ ids: ['search', 'counter'], hash: 'h' }),
  variantsFor: () => new Map(),
  resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, catalog: { ids: ['search', 'counter'], hash: 'h' }, variants: new Map(), policy }),
  wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
  runtime: {} as ShellHostContext['runtime'],
};

const socketOf = (): { accept: ReturnType<typeof createSocket>; shells: ReturnType<typeof createShellHost>; pages: ReturnType<typeof createShellHost> } => {
  const shells = createShellHost(context);
  const pages = createShellHost({ ...context, manifest: page, kept: false });
  const router = createPageRouter({ find: page });
  const accept = createSocket({
    session: (token) => (token === 'good' ? 'usr_1' : null),
    catalog: () => ({ ids: ['search', 'counter'], hash: 'h' }),
    shells,
    page: (path) => {
      const matched = router.match(path);
      return matched === undefined ? undefined : { host: pages, inputs: { main: matched.params } };
    },
    revalidateMs: 0,
  });
  return { accept, shells, pages };
};

const connect = async (accept: ReturnType<typeof createSocket>, url: string): Promise<Record<string, unknown>[]> => {
  const sent: Record<string, unknown>[] = [];
  const connection: Connection = { send: (text) => void sent.push(JSON.parse(text) as Record<string, unknown>), close: () => {}, onMessage: () => {}, onClose: () => {} };
  await accept(url, connection);
  await tick(5);
  return sent;
};

const actionOn = (sent: Record<string, unknown>[]): string => JSON.stringify(sent.find((message) => message['type'] === 'render')?.['tree']);

describe('the socket — a path decides which shell', () => {
  it('no path, or a path that is nobody’s page: the app’s shell', async () => {
    const { accept } = socketOf();
    expect(actionOn(await connect(accept, '/socket?protocol=1'))).toContain('"definitionId":"counter"');
    expect(actionOn(await connect(accept, '/socket?protocol=1&path=%2Felsewhere'))).toContain('"definitionId":"counter"');
  });

  it('a page’s path: that page’s shell, seeded with the path’s parameters', async () => {
    const { accept, pages } = socketOf();
    const sent = await connect(accept, '/socket?protocol=1&path=%2Ffind%2Fwine');
    expect(actionOn(sent)).toContain('"definitionId":"search"');
    // built for this connection alone — nothing is kept, signed in or not
    const signedIn = await connect(accept, '/socket?protocol=1&token=good&path=%2Ffind%2Fwine');
    expect(actionOn(signedIn)).toContain('"definitionId":"search"');
    expect(pages.list()).toEqual([]);
  });

  it('a signed-in terminal on a page does not build their app shell', async () => {
    const { accept, shells } = socketOf();
    await connect(accept, '/socket?protocol=1&token=good&path=%2Ffind%2Fwine');
    expect(shells.list()).toEqual([]);
    await connect(accept, '/socket?protocol=1&token=good');
    expect(shells.list().map((shell) => shell.principal)).toEqual(['usr_1']);
  });

  it('a seed that is not one is ignored, not trusted', async () => {
    const { accept } = socketOf();
    const sent = await connect(accept, '/socket?protocol=1&seed=act-1%22%3E');
    expect(actionOn(sent)).not.toContain('act-act-1');
    expect(actionOn(sent)).toMatch(/"instanceId":"act-[0-9a-f-]{36}"/);
  });
});

// ── the wire's half ──
let urls: string[] = [];
const env = (token: string | null = null): WireEnv => ({
  tokens: { load: () => token, save: () => {}, clear: () => {} },
  socket: (url) => {
    urls.push(url);
    return { send: () => {}, close: () => {}, onopen: null, onmessage: null, onclose: null } as unknown as WebSocket;
  },
  defaultUrl: () => 'ws://host/socket',
});

describe('the wire — a page that needs no socket opens none', () => {
  beforeEach(() => {
    urls = [];
  });

  it('a drawn page with nothing left to happen: `static`, and no socket', () => {
    const wire = createWire({ env: env(), initial: { frame: [], trees: {}, principal: false, live: false, path: '/about' } });
    expect(wire.status()).toBe('static');
    expect(urls).toEqual([]);
    wire.dispatch('main', { type: 'ui:click', ref: 'x' } as never); // nothing to send it over; nothing thrown
  });

  it('…until it is asked for one: `reset` connects, naming the page’s path', () => {
    const wire = createWire({ env: env(), initial: { frame: [], trees: {}, principal: false, live: false, path: '/about' } });
    wire.reset();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('path=%2Fabout');
  });

  it('a live page connects at once, naming its path and its seed', () => {
    createWire({ env: env(), initial: { frame: [], trees: {}, principal: false, live: true, path: '/find/wine', seed: 'abcdef0123' } });
    expect(urls[0]).toContain('path=%2Ffind%2Fwine');
    expect(urls[0]).toContain('seed=abcdef0123');
  });

  it('a page that does not say is not concluded finished', () => {
    createWire({ env: env(), initial: { frame: [], trees: {}, principal: false } });
    expect(urls).toHaveLength(1);
  });

  it('a page that was not drawn on the server can still name its path', () => {
    createWire({ env: env(), path: '/find/wine' });
    expect(urls[0]).toContain('path=%2Ffind%2Fwine');
  });

  it('a static page drawn for nobody, opened by somebody holding a token: it connects, as them', () => {
    createWire({ env: env('tok'), initial: { frame: [], trees: {}, principal: false, live: false, path: '/about' } });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('token=tok');
    expect(urls[0]).toContain('path=%2Fabout');
  });
});

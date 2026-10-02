import { describe, it, expect, vi } from 'vitest';
import type { ActionDefinition } from '@niscorp/nova';
import type { ScopePolicy } from '@niscorp/vex';
import { createShellHost } from '../src/shells';
import type { ShellHostContext } from '../src/shells';
import type { NiscApp, PageManifest } from '../src/app';
import type { Connection } from '../src/socket';
import { shellNeedOf } from '../src/liveness';

// ═══════════════════════════════════════════════════════════════
// The document's read (`snapshot`), and the two things built on it: an
// ephemeral shell whose ids a later connection can reproduce (the seed), and a
// host that keeps nothing (a page's).
// ═══════════════════════════════════════════════════════════════

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

const fakeConnection = (): Connection & { sent: Record<string, unknown>[] } => {
  const sent: Record<string, unknown>[] = [];
  return { sent, send: (text) => void sent.push(JSON.parse(text) as Record<string, unknown>), close: () => {}, onMessage: () => {}, onClose: () => {} };
};

// Three actions, one of each kind: nothing left to do, something to press, and
// one a member is granted and nobody else.
const words: ActionDefinition = { id: 'words', data: { title: 'Hello', slug: '' }, layout: { component: 'Text', children: '$.title' } };
const counter: ActionDefinition = { id: 'counter', data: { n: 0 }, layout: { component: 'Button', ref: 'bump', children: '$.n' }, triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }] };
const chip: ActionDefinition = { id: 'chip', data: { name: '' }, layout: { component: 'Text', children: '$.name' } };

const policy: ScopePolicy = { default: 'deny', entities: {} };
const grants = (principal: string | null): string[] => (principal === null ? ['words', 'counter'] : ['words', 'counter', 'chip']);

const contextOf = (app: NiscApp, extra: Partial<ShellHostContext> = {}): ShellHostContext => ({
  app,
  catalogFor: () => ({ ids: ['words', 'counter', 'chip'], hash: 'h' }),
  variantsFor: () => new Map(),
  resolve: async (principal) => ({ roles: [principal === null ? 'public' : 'member'], scope: {}, installed: undefined, catalog: { ids: grants(principal), hash: 'h' }, variants: new Map(), policy }),
  wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
  runtime: {} as ShellHostContext['runtime'],
  needOf: (definition) => shellNeedOf(definition, new Map()),
  ...extra,
});

const appOf = (shell: NiscApp['shell'], extra: Partial<NiscApp> = {}): NiscApp =>
  ({ charter: {}, assignments: {}, actions: { words, counter, chip }, shell, ...extra }) as unknown as NiscApp;

describe('snapshot — the screen, read without attaching', () => {
  it('is what a terminal would be sent on attach', async () => {
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', initial: 'counter' }] })));
    const snapshot = await host.snapshot('t', 'usr_1');
    const connection = fakeConnection();
    (await host.session('t', 'usr_1')).attach(connection);
    expect(connection.sent.find((message) => message['type'] === 'frame')?.['tree']).toEqual(snapshot.frame);
    expect(connection.sent.find((message) => message['type'] === 'render')?.['tree']).toEqual(snapshot.trees['main']);
  });

  it('a principal’s shell is built and KEPT — the socket attaches to the one that was read', async () => {
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', initial: 'counter' }] })));
    const snapshot = await host.snapshot('t', 'usr_1');
    expect(snapshot.seed).toBeUndefined();
    expect(host.list().map((shell) => shell.principal)).toEqual(['usr_1']);
    const connection = fakeConnection();
    (await host.session('t', 'usr_1')).attach(connection);
    // same shell, so the same instance ids, with no seed involved
    expect(connection.sent.find((message) => message['type'] === 'render')?.['tree']).toEqual(snapshot.trees['main']);
  });

  it('nobody’s shell is built, read and let go — and a connection naming its seed mints the same ids', async () => {
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', initial: 'counter' }] })));
    const snapshot = await host.snapshot(null, null);
    expect(snapshot.seed).toMatch(/^[0-9a-f]{18}$/);
    expect(host.list()).toEqual([]);

    const seeded = fakeConnection();
    (await host.session(null, null, { seed: snapshot.seed })).attach(seeded);
    expect(seeded.sent.find((message) => message['type'] === 'render')?.['tree']).toEqual(snapshot.trees['main']);

    // without the seed the ids are the shell's own, and unguessable
    const unseeded = fakeConnection();
    (await host.session(null, null)).attach(unseeded);
    expect(unseeded.sent.find((message) => message['type'] === 'render')?.['tree']).not.toEqual(snapshot.trees['main']);
  });

  it('two snapshots are two seeds: an id from one page names nothing in another’s shell', async () => {
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', initial: 'counter' }] })));
    const [a, b] = [await host.snapshot(null, null), await host.snapshot(null, null)];
    expect(a.seed).not.toEqual(b.seed);
    expect(a.trees['main']).not.toEqual(b.trees['main']);
  });

  it('waits for seeds that are read a moment later', async () => {
    const seeds = async (): Promise<Record<string, string[]>> => {
      await tick(30);
      return { main: ['words'] };
    };
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', mode: 'list' }], seeds })));
    const snapshot = await host.snapshot(null, null);
    expect(snapshot.settled).toBe(true);
    expect(JSON.stringify(snapshot.trees['main'])).toContain('Hello');
  });

  it('past the wait, the screen goes out as it stands and says so', async () => {
    const seeds = async (): Promise<Record<string, string[]>> => {
      await tick(80);
      return { main: ['words'] };
    };
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', mode: 'list' }], seeds })));
    const snapshot = await host.snapshot(null, null, { waitMs: 5 });
    expect(snapshot.settled).toBe(false);
    expect(JSON.stringify(snapshot.trees['main'])).not.toContain('Hello');
  });

  it('leaves the attached terminals’ baseline alone: the next change still reaches them', async () => {
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', initial: 'counter' }] })));
    const session = await host.session('t', 'usr_1');
    const connection = fakeConnection();
    session.attach(connection);
    connection.sent.length = 0;

    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await host.snapshot('t', 'usr_1'); // reads the changed tree before the flush has sent it
    await tick(5);
    expect(connection.sent.filter((message) => message['type'] === 'render').length).toBeGreaterThan(0);
  });
});

describe('snapshot — whether anything can still happen', () => {
  it('nothing mounted can: not live, and the trees are the whole of it', async () => {
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', initial: 'words' }] })));
    const snapshot = await host.snapshot(null, null);
    expect(snapshot.live).toBe(false);
    expect(snapshot.why).toEqual([]);
  });

  it('something can be pressed: live, and it says what', async () => {
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', initial: 'counter' }] })));
    const snapshot = await host.snapshot(null, null);
    expect(snapshot.live).toBe(true);
    expect(snapshot.why).toEqual(['counter: a person can act on it']);
  });

  it('the app’s shell is live for whoever is signed in, whatever is on it', async () => {
    const host = createShellHost(contextOf(appOf({ canvases: [{ id: 'main', initial: 'words' }] })));
    expect((await host.snapshot('t', 'usr_1')).live).toBe(true);
  });

  it('a host that cannot ask does not conclude a screen is finished', async () => {
    const ctx = contextOf(appOf({ canvases: [{ id: 'main', initial: 'words' }] }));
    const { needOf: _withheld, ...unable } = ctx;
    expect((await createShellHost(unable).snapshot(null, null)).live).toBe(true);
  });
});

describe('a page’s host — the same machinery, keeping nothing', () => {
  const page: PageManifest = {
    path: '/docs/:slug',
    params: 'main',
    canvases: [
      { id: 'main', initial: 'words' },
      // a member is granted the chip; nobody else has it
      { id: 'who', initial: 'chip' },
    ],
    inputs: ({ principal }): Record<string, Record<string, unknown>> => (principal === null ? {} : { who: { name: 'Max' } }),
  };
  const app = appOf({ canvases: [{ id: 'main', initial: 'counter' }] });

  it('draws for whoever asks — a member’s chip is an action a member is granted — and keeps no shell for them', async () => {
    const host = createShellHost(contextOf(app, { manifest: page, kept: false }));
    const forMax = await host.snapshot('t', 'usr_1');
    const forNobody = await host.snapshot(null, null);
    expect(JSON.stringify(forMax.trees['who'])).toContain('Max');
    expect(forNobody.trees['who']).toEqual([]);
    expect(host.list()).toEqual([]);
    // signed in, and still nothing left to happen: no shell, no socket
    expect(forMax.live).toBe(false);
    expect(forMax.seed).toBeDefined();
  });

  it('the path’s parameters arrive as the canvas seed’s input', async () => {
    const host = createShellHost(contextOf(app, { manifest: page, kept: false }));
    const withTitle = await host.snapshot(null, null, { inputs: { main: { title: 'Getting started' } } });
    expect(JSON.stringify(withTitle.trees['main'])).toContain('Getting started');
  });

  it('a connection to it gets a shell of its own, for that connection alone', async () => {
    const host = createShellHost(contextOf(app, { manifest: page, kept: false }));
    const a = await host.session('t', 'usr_1');
    const b = await host.session('t', 'usr_1');
    expect(a.shell).not.toBe(b.shell);
    expect(host.list()).toEqual([]);
  });

  it('runs no session code: `onSession` is the app’s', async () => {
    const onSession = vi.fn();
    const withCode = appOf({ canvases: [{ id: 'main', initial: 'counter' }] }, { onSession });
    await createShellHost(contextOf(withCode, { manifest: page, kept: false })).snapshot('t', 'usr_1');
    expect(onSession).not.toHaveBeenCalled();
    await createShellHost(contextOf(withCode)).snapshot('t', 'usr_1');
    expect(onSession).toHaveBeenCalledTimes(1);
  });
});

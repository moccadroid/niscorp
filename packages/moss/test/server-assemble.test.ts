import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { scopeGrants } from '@niscorp/vex';
import { createDataWith } from '../src/data/data';
import { featureTablesOf } from '../src/data/migrate';
import { createGrammarUpgrader } from '../src/data/engine';
import type { Feature, FeatureEnv } from '../src/feature';
import type { NiscApp } from '../src/manifest';
import type { NiscRuntime } from '../src/runtime';
import { assembleServer } from '../src/server/server';
import { ADD_NOTE, READ_NOTES, engineDouble } from './data-double';

const appWith = (more: Partial<NiscApp>): NiscApp => ({
  charter: { public: ['home'] },
  actions: { home: { id: 'home' } },
  shell: { canvases: [{ id: 'main', initial: 'home' }] },
  identity: { resolve: async () => ({ roles: ['public'], scope: {} }) },
  ...more,
});

const assemble = async (app: NiscApp, more: Partial<NiscRuntime> = {}) => {
  const double = await engineDouble();
  const data = createDataWith(
    { engine: double.engine, adapter: double.adapter, grants: scopeGrants(['notes', 'tags']), grammars: await createGrammarUpgrader({}), upgradeStore: async () => undefined, askFirst: double.askFirst },
    { db: double.db, charter: app.charter, featureTables: featureTablesOf(app) },
  );
  return assembleServer({ app, runtime: { pool: { query: async () => ({ rows: [] }) }, db: double.db, session: 'dev-open', ...more }, session: whoseToken, revokeSessions: undefined, data });
};

const whoseToken = (token: string): string | null => (token.startsWith('t_') ? token.slice(2) : null);

const intervalsDuring = async (run: () => Promise<unknown>): Promise<{ made: unknown[]; left: unknown[]; outcome: unknown }> => {
  const set = vi.spyOn(globalThis, 'setInterval');
  const clear = vi.spyOn(globalThis, 'clearInterval');
  const outcome = await run().catch((error: unknown) => error);
  const made = set.mock.results.map((result) => result.value);
  const cleared = new Set(clear.mock.calls.map(([handle]) => handle));
  return { made, left: made.filter((handle) => !cleared.has(handle)), outcome };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the server, assembled — a boot that fails stops what it started', () => {
  it('a feature that throws when it is started leaves no interval running', async () => {
    const failing = { name: 'failing', start: () => Promise.reject(new Error('the feature could not start')) };
    const { made, left, outcome } = await intervalsDuring(() => assemble(appWith({ features: [failing] })));
    expect(outcome).toMatchObject({ message: 'the feature could not start' });
    expect(made).toHaveLength(2);
    expect(left).toEqual([]);
  });

  it('a page the router refuses leaves none either: the app’s own host had been made before it', async () => {
    const twice = { path: '/docs/:id/versions/:id', canvases: [{ id: 'main', initial: 'home' }] };
    const { made, left, outcome } = await intervalsDuring(() => assemble(appWith({ pages: { twice } })));
    expect(outcome).toMatchObject({ message: expect.stringMatching(/names the parameter ":id" twice/) });
    expect(made.length).toBeGreaterThan(0);
    expect(left).toEqual([]);
  });

  it('a boot that succeeds keeps what it started until it is closed, and then keeps nothing', async () => {
    // The database has no pointer row, so the poll logs an error.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { made, left, outcome } = await intervalsDuring(async () => {
      const server = await assemble(appWith({}));
      return server;
    });
    expect(made).toHaveLength(4);
    expect(left).toHaveLength(4);
    const clear = vi.spyOn(globalThis, 'clearInterval');
    expect(outcome).toMatchObject({ close: expect.any(Function) });
    if (outcome !== null && typeof outcome === 'object' && 'close' in outcome && typeof outcome.close === 'function') outcome.close();
    expect(new Set(clear.mock.calls.map(([handle]) => handle))).toEqual(new Set(made));
  });

  it('no timer a server starts keeps its process alive', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = { path: '/docs', canvases: [{ id: 'main', initial: 'home' }] };
    const { made, outcome } = await intervalsDuring(() => assemble(appWith({ pages: { page } })));
    try {
      expect(made).toHaveLength(5);
      const holding = made.map((handle) => (handle !== null && typeof handle === 'object' && 'hasRef' in handle && typeof handle.hasRef === 'function' ? Boolean(handle.hasRef()) : true));
      expect(holding).toEqual([false, false, false, false, false]);
    } finally {
      if (outcome !== null && typeof outcome === 'object' && 'close' in outcome && typeof outcome.close === 'function') outcome.close();
    }
  });
});

describe('the server, assembled — what holds only because of where a line stands', () => {
  const quiet = (): void => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  };

  // A prefix takes its routes when it is mounted, so it is mounted after every feature has started.
  it('a route a feature adds to the operator prefix answers the operator’s key, and nobody else', async () => {
    quiet();
    const listing: Feature = {
      name: 'listing',
      start: (seams) => {
        const routes = new Hono<FeatureEnv>();
        routes.get('/things', (c) => c.json({ things: ['one'] }));
        seams.mountOperatorRoutes(routes);
      },
    };
    const server = await assemble(appWith({ features: [listing] }), { operatorKey: 'the-operators-key' });
    try {
      const asked = await server.request('/operator/things', { headers: { 'x-operator-key': 'the-operators-key' } });
      expect(asked.status).toBe(200);
      expect(await asked.json()).toEqual({ things: ['one'] });
      expect((await server.request('/operator/things', { headers: { 'x-operator-key': 'another-key' } })).status).toBe(404);
      expect((await server.request('/operator/things')).status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('a change to what the app consists of drops every identity record: who somebody is, is asked again', async () => {
    quiet();
    const now = { roles: ['public'] };
    const app = appWith({
      charter: { public: ['home'], staff: ['home'] },
      identity: { resolve: async () => ({ roles: now.roles, scope: {} }) },
    });
    const server = await assemble(app);
    try {
      expect((await server.identity('i_mara')).roles).toEqual(['public']);
      now.roles = ['staff'];
      expect((await server.identity('i_mara')).roles).toEqual(['public']);
      server.refresh();
      expect((await server.identity('i_mara')).roles).toEqual(['staff']);
      now.roles = ['public'];
      server.replaceActions('extras', { extra: { id: 'extra' } });
      expect((await server.identity('i_mara')).roles).toEqual(['public']);
    } finally {
      server.close();
    }
  });

  it('a set of actions handed over reaches a shell that is already open', async () => {
    quiet();
    const server = await assemble(appWith({ charter: { public: ['home', 'extra'] } }));
    try {
      const session = await server.shells?.session('t_i_mara', 'i_mara');
      expect(() => session?.shell.push('main', 'extra')).toThrow();

      server.replaceActions('extras', { extra: { id: 'extra', data: {} } });
      await vi.waitFor(() => expect(session?.shell.push('main', 'extra')).toEqual(expect.any(String)));
    } finally {
      server.close();
    }
  });

  it('a set of entries handed over is replayed by the next request, and refused again once the set no longer holds it', async () => {
    quiet();
    const server = await assemble(appWith({ charter: { public: { actions: ['home'], data: ['notes.read'] } } }));
    const asked = async (): Promise<unknown> => {
      const answered = await server.request('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: 'ext/notes', context: {} }) });
      return answered.json();
    };
    try {
      expect(await asked()).toMatchObject({ error: 'cache_miss' });
      await server.replaceEntries('extras', [{ ...READ_NOTES, fingerprint: 'ext/notes' }]);
      expect(await asked()).toMatchObject({ result: [{ id: 1, body: 'first' }] });
      await server.replaceEntries('extras', []);
      expect(await asked()).toMatchObject({ error: 'cache_miss' });
    } finally {
      server.close();
    }
  });
});

describe('the server, assembled — who a call is made as', () => {
  const quiet = (): void => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  };
  const member = {
    charter: { public: ['home'], member: { actions: ['home'], data: ['notes.read', 'notes.write.insert'] } },
    identity: { resolve: async () => ({ roles: ['member'], scope: { studioId: 's_1' } }) },
    scope: () => ({ today: '2026-10-11' }),
  };

  it('a write is scoped by who made it: their id, their record’s values, and what the app’s `scope` adds', async () => {
    quiet();
    const heard: unknown[] = [];
    const server = await assemble(appWith({ ...member, entries: [ADD_NOTE], reactions: [{ table: 'notes', op: 'insert', run: (said) => void heard.push(said) }] }));
    try {
      const answered = await server.request('/api/vex', {
        method: 'POST',
        headers: { authorization: 'Bearer t_i_mara', 'content-type': 'application/json' },
        body: JSON.stringify({ fingerprint: 'notes/add', context: { body: 'a note' } }),
      });
      expect(answered.status).toBe(200);
      expect(heard).toEqual([{ fingerprint: 'notes/add', table: 'notes', op: 'insert', count: 1, scope: { userId: 'i_mara', studioId: 's_1', today: '2026-10-11' } }]);
    } finally {
      server.close();
    }
  });

  it('a screen’s call goes through what a feature laid around the wire, and is answered as its session', async () => {
    quiet();
    const through: string[] = [];
    const wrapping: Feature = {
      name: 'wrapping',
      start: (seams) => {
        seams.wrapWire((inner) => (url, init) => {
          through.push(url);
          return inner(url, init);
        });
      },
    };
    const home = { id: 'home', data: { me: null }, endpoints: { who: { url: '/catalog', method: 'GET' as const, target: 'me' } }, lifecycle: { mount: [{ call: 'who' }] } };
    const server = await assemble(appWith({ ...member, actions: { home }, features: [wrapping] }));
    try {
      const session = await server.shells?.session('t_i_mara', 'i_mara');
      const answered = await new Promise<unknown>((resolve) => {
        const read = (): void => {
          const me: unknown = session?.shell.getRuntime(session.shell.getState().canvases['main']?.active?.id ?? '')?.getData()['me'];
          if (me !== null && me !== undefined) resolve(me);
        };
        session?.shell.onDataChange(read);
        read();
      });
      expect(answered).toMatchObject({ principal: 'i_mara', actions: ['home'] });
      expect(through).toEqual(['/catalog']);
    } finally {
      server.close();
    }
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { scopeGrants } from '@niscorp/vex';
import type { Data } from '../src/data';
import { createDataWith } from '../src/data/data';
import { featureTablesOf } from '../src/data/migrate';
import { createGrammarUpgrader } from '../src/data/engine';
import type { Feature, FeatureEnv } from '../src/feature';
import type { FunctionSession, NiscApp } from '../src/manifest';
import type { NiscRuntime } from '../src/runtime';
import { assembleServer, createServer } from '../src/server/server';
import { ADD_NOTE, READ_NOTES, engineDouble, nothingSavedIn } from './data-double';

const appWith = (more: Partial<NiscApp>): NiscApp => ({
  charter: { public: ['home'] },
  actions: { home: { id: 'home' } },
  shell: { canvases: [{ id: 'main', initial: 'home' }] },
  identity: { resolve: async () => ({ roles: ['public'], scope: {} }) },
  ...more,
});

const assemble = async (app: NiscApp, more: Partial<NiscRuntime> = {}, artifactEntries?: Data['artifactEntries'], pointer?: Data['pointer']) => {
  const double = await engineDouble();
  const built = nothingSavedIn(
    createDataWith(
      { engine: double.engine, adapter: double.adapter, grants: scopeGrants(['notes', 'tags']), grammars: await createGrammarUpgrader({}), upgradeStore: async () => undefined, askFirst: double.askFirst },
      { db: double.db, charter: app.charter, featureTables: featureTablesOf(app) },
    ),
  );
  const data = { ...built, ...(artifactEntries === undefined ? {} : { artifactEntries }), ...(pointer === undefined ? {} : { pointer }) };
  return assembleServer({ app, runtime: { pool: { query: async () => ({ rows: [] }) }, db: double.db, session: 'dev-open', ...more }, session: whoseToken, revokeSessions: undefined, data });
};

const whoseToken = (token: string): string | null => (token.startsWith('t_') ? token.slice(2) : null);

// What the database does for the artifactory's entries, as far as these cases go: one version of each
// artifact is written, so what is in force is every row of the caller. No entry names a principal: whose
// a row is, is the `userId` of the scope it is replayed with, and who made it the `artifactSavedBy`.
const rowsKept = (kept: Record<string, unknown>[] = []): { kept: Record<string, unknown>[]; entries: Data['artifactEntries'] } => ({
  kept,
  entries: async () => async (fingerprint, context, scope) => {
    const versions = context['versions'];
    expect(Object.keys(context)).not.toContain('principal');
    if (fingerprint === 'artifactory/save' && Array.isArray(versions)) {
      for (const version of versions) kept.push({ ...version, save: context['save'], principal: scope?.['userId'], by: scope?.['artifactSavedBy'], created_at: new Date(0) });
    }
    return fingerprint === 'artifactory/in-force' ? kept.filter((row) => row['principal'] === scope?.['userId']) : [];
  },
});

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

describe('what a caller reads and writes of what was saved', () => {
  it('is not the app’s to say: `behaviors` that name either table refuse the boot, before the database is asked anything', async () => {
    const asked: string[] = [];
    const pool = { query: async (text: string) => (asked.push(text), { rows: [] }) };
    const everybodys = appWith({ behaviors: { notes: { read: [] }, artifacts: { read: [] } } });

    await expect(createServer(everybodys, { pool, db: pool, session: 'dev-open' })).rejects.toThrow(
      'moss: the app’s `behaviors` say what a caller reads and writes of "artifacts". ' +
        'Those rows are whoever saved them: moss keeps every read and write of them to the caller’s own, and an app does not say otherwise.',
    );
    expect(asked).toEqual([]);
  });
});

describe('the server, assembled — `checkFunctions` reads the app’s functions before anyone is served', () => {
  const leaving = { charter: { public: { actions: ['home'], functions: ['auth.*'] } }, actions: { home: { id: 'home', endpoints: { leave: { fn: 'auth.leave' } } } } };

  it('builds nobody’s shell once, and refuses an action that calls a function the app does not have', async () => {
    const built: (string | null)[] = [];
    const server = await assemble(appWith({ ...leaving, functions: (session) => (built.push(session.principal), [{ id: 'auth.enter', description: 'Signs the person in.', execute: async () => undefined }]) }));
    try {
      await expect(server.checkFunctions()).rejects.toThrow('"home" calls "auth.leave", which the app has no function of');
      expect(built).toEqual([null]);
    } finally {
      server.close();
    }
  });

  it('an app with no `functions` has none: an `fn:` endpoint in it is refused the same way, with no shell built', async () => {
    const server = await assemble(appWith(leaving));
    try {
      await expect(server.checkFunctions()).rejects.toThrow('"home" calls "auth.leave", which the app has no function of');
    } finally {
      server.close();
    }
  });
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

  it('a boot that cannot load the entries over what was saved fails there, and leaves no interval running', async () => {
    const { left, outcome } = await intervalsDuring(() => assemble(appWith({}), {}, () => Promise.reject(new Error('the database went away'))));
    expect(outcome).toMatchObject({ message: 'the database went away' });
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

  it('a layout saved in a function’s session reaches the open shell of its principal and nobody else’s, and the fabric is told to bring that principal’s shells level', async () => {
    quiet();
    const sessions = new Map<string | null, FunctionSession>();
    const carried: unknown[] = [];
    const { kept, entries: saved } = rowsKept();
    const asBuilt = { component: 'Text', children: 'as built' };
    const asMaraHasIt = { component: 'Text', children: 'as mara has it' };
    const app = appWith({
      actions: { home: { id: 'home', layout: asBuilt } },
      functions: (session) => {
        sessions.set(session.principal, session);
        return {};
      },
    });
    const server = await assemble(app, { fabric: { publish: (message) => void carried.push(message), subscribe: () => undefined } }, saved);
    try {
      const maras = await server.shells?.session('t_i_mara', 'i_mara');
      const bens = await server.shells?.session('t_i_ben', 'i_ben');

      await sessions.get('i_mara')?.artifacts.save([{ kind: 'layout', body: { ref: 'action/home', layout: asMaraHasIt, use: true } }]);

      await vi.waitFor(() => expect(maras?.shell.layoutStore.get('action/home')).toEqual(asMaraHasIt));
      expect(bens?.shell.layoutStore.get('action/home')).toEqual(asBuilt);
      expect(kept.map((row) => [row['principal'], row['by']])).toEqual([['i_mara', 'i_mara']]);
      expect(carried).toEqual([{ kind: 'adopt', principal: 'i_mara', origin: expect.any(String) }]);
    } finally {
      server.close();
    }
  });

  it('a generated action replays a read as its owner: saved where their charter grants the read, it answers in their shell; where it does not, the save is refused', async () => {
    quiet();
    const sessions = new Map<string | null, FunctionSession>();
    const reading = {
      data: { rows: [] },
      endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'notes/all' }, target: 'rows' } },
      lifecycle: { mount: [{ call: 'load' }] },
      layout: { component: 'Text', children: 'the notes' },
    };
    const granted = (data: readonly string[]): NiscApp =>
      appWith({
        charter: { public: { actions: ['home'], data: [...data] } },
        actions: { home: { id: 'home', layout: { component: 'Text', children: 'home' } } },
        entries: [READ_NOTES],
        functions: (session) => {
          sessions.set(session.principal, session);
          return {};
        },
      });
    const server = await assemble(granted(['notes.read']), {}, rowsKept().entries);
    try {
      const maras = await server.shells?.session('t_i_mara', 'i_mara');
      const saved = await sessions.get('i_mara')?.artifacts.save([{ kind: 'action', body: reading }]);
      const id = saved?.artifacts[0]?.id ?? '';
      expect(id).toMatch(/^generated\./);

      const opened = await vi.waitFor(() => maras?.shell.push('main', id) ?? '');
      await vi.waitFor(() => expect(maras?.shell.getRuntime(opened)?.getData()['rows']).toEqual([{ id: 1, body: 'first' }]));
    } finally {
      server.close();
    }

    const without = await assemble(granted([]), {}, rowsKept().entries);
    try {
      await without.shells?.session('t_i_mara', 'i_mara');
      await expect(sessions.get('i_mara')?.artifacts.save([{ kind: 'action', body: reading }])).rejects.toThrow(
        'moss: the action is refused: endpoint "load" replays "notes/all", which its owner may not replay',
      );
    } finally {
      without.close();
    }
  });

  it('a layout published with `server.defaults` reaches every open shell and is kept as everybody’s, by whoever published; the fabric carries nothing for it', async () => {
    quiet();
    const carried: unknown[] = [];
    const { kept, entries } = rowsKept();
    const asBuilt = { component: 'Text', children: 'as built' };
    const asPublished = { component: 'Text', children: 'as published' };
    const server = await assemble(
      appWith({ actions: { home: { id: 'home', layout: asBuilt } } }),
      { fabric: { publish: (message) => void carried.push(message), subscribe: () => undefined } },
      entries,
    );
    try {
      const maras = await server.shells?.session('t_i_mara', 'i_mara');
      const nobodys = await server.shells?.session(null, null);

      await server.defaults('i_pat').save([{ kind: 'layout', body: { ref: 'action/home', layout: asPublished, use: true } }]);

      await vi.waitFor(() => expect(maras?.shell.layoutStore.get('action/home')).toEqual(asPublished));
      await vi.waitFor(() => expect(nobodys?.shell.layoutStore.get('action/home')).toEqual(asPublished));
      expect(kept.map((row) => [row['principal'], row['by']])).toEqual([['*', 'i_pat']]);
      expect(carried).toEqual([]);

      const nobody = 'moss: `defaults` is handed who publishes. What is published is everybody’s, and who published it is kept with it.';
      expect(() => server.defaults('')).toThrow(nobody);
      expect(() => server.defaults(null as unknown as string)).toThrow(nobody);
    } finally {
      server.close();
    }
  });

  it('a server that boots reads what is published, and a boot that cannot read it fails', async () => {
    quiet();
    const asPublished = { component: 'Text', children: 'as published' };
    const before = [{ kind: 'layout', id: 'a-default', body: { ref: 'action/home', layout: asPublished, use: true }, save: '0b0e7a52-6f0e-4b8e-9d0c-1f2e3a4b5c6d', principal: '*', created_at: new Date(0) }];
    const app = appWith({ actions: { home: { id: 'home', layout: { component: 'Text', children: 'as built' } } } });
    const server = await assemble(app, {}, rowsKept(before).entries);
    try {
      expect((await server.shells?.session('t_i_mara', 'i_mara'))?.shell.layoutStore.get('action/home')).toEqual(asPublished);
    } finally {
      server.close();
    }

    const unread: Data['artifactEntries'] = async () => () => Promise.reject(new Error('the database went away'));
    const { left, outcome } = await intervalsDuring(() => assemble(app, {}, unread));
    expect(outcome).toMatchObject({ message: 'the database went away' });
    expect(left).toEqual([]);
  });

  // Read before the pointer is watched, a publish another process made while the features started would be
  // neither read nor followed: the pointer's first look is where it counts from.
  it('what is published is read once the generation pointer is watched', async () => {
    quiet();
    const order: string[] = [];
    const entries: Data['artifactEntries'] = async () => async (fingerprint, _context, scope) => {
      if (fingerprint === 'artifactory/in-force' && scope?.['userId'] === '*') order.push('what is published is read');
      return [];
    };
    const pointer = { read: async () => (order.push('the pointer is looked at'), 0), move: async () => true };
    const server = await assemble(appWith({}), {}, entries, pointer);
    try {
      expect(order.slice(0, 2)).toEqual(['the pointer is looked at', 'what is published is read']);
    } finally {
      server.close();
    }
  });

  it('no caller is the principal what is published is kept under: for one whose `userId` says so no shell is built, and no read or write of the app’s is run', async () => {
    quiet();
    const everybody = appWith({ charter: { public: { actions: ['home'], data: ['notes.read'] } }, entries: [READ_NOTES], scope: () => ({ userId: '*' }) });
    const server = await assemble(everybody);
    const somebody = await assemble({ ...everybody, scope: () => ({}) });
    const read = { method: 'POST', headers: { authorization: 'Bearer t_i_mara', 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: 'notes/all', context: {} }) };
    try {
      await expect(server.shells?.session('t_i_mara', 'i_mara')).rejects.toThrow(
        'moss: a caller’s `userId` is "*", and that is whose the rows published for everybody are. No caller is it: the app’s sign-in or its `scope` answers another.',
      );
      expect((await server.request('/api/vex', read)).status).toBe(500);
      expect((await somebody.request('/api/vex', read)).status).toBe(200);
    } finally {
      server.close();
      somebody.close();
    }

    // Nor does a caller's scope say who made a save.
    const forging = await assemble({ ...everybody, scope: () => ({ artifactSavedBy: 'somebody-else' }) });
    try {
      expect((await forging.request('/api/vex', read)).status).toBe(500);
    } finally {
      forging.close();
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

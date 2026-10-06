import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { SignalClient } from '@niscorp/cortex';
import type { DatabaseAdapter, PgPool, Query, QueryEngine, QueryEngineConfig, ScopePolicy, ScopeValues, SeedEntry } from '../../src/index.js';
import type { VexExpressResponse } from '../../src/adapters/express/index.js';

// THE BUILT ENTRIES, loaded the way `require('@niscorp/vex')` and
// `require('@niscorp/vex/hono')` load them.
//
// Every other suite imports source, where VexError is one class. The built
// CommonJS files are not split: each entry carries its own copy of the class,
// so an error thrown by an engine from one entry is not an `instanceof` the
// VexError another entry holds. The HTTP handler used to ask exactly that, and
// answered every engine error on a read with a 500. An app that loads the two
// formats side by side splits the class the same way.
//
// Nothing here imports source at run time (the imports above are types). It
// needs `dist/`, which the `test` task builds first; run on its own, build
// first — it reads the files as they were last built.

type Core = typeof import('../../src/index.js');
type PgliteEntry = typeof import('../../src/adapters/pglite/index.js');
type HonoEntry = typeof import('../../src/adapters/hono/index.js');
type ExpressEntry = typeof import('../../src/adapters/express/index.js');
type AgentEntry = typeof import('../../src/agent/index.js');

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
const requireBuilt = createRequire(import.meta.url);
const commonjs = <Entry>(entry: string): Entry => requireBuilt(join(dist, `${entry}.cjs`));
const esm = async <Entry>(entry: string): Promise<Entry> => import(pathToFileURL(join(dist, `${entry}.js`)).href);

const DDL = `
  CREATE TABLE notes (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, body TEXT);
  CREATE TABLE secrets (id TEXT PRIMARY KEY, secret TEXT NOT NULL);
`;

const notesOnly: ScopePolicy = { default: 'deny', entities: { notes: { public: true } } };
const byTenant: ScopePolicy = { default: 'deny', entities: { notes: { read: [{ match: 'tenant_id', to: 'tenantId' }] } } };

const SEEDS: SeedEntry[] = [
  { fingerprint: 'notes/all', intent: 'All notes', shape: [{ id: '' }], dsl: { from: ['notes'], fields: ['notes.id'] } },
  { fingerprint: 'secrets/all', intent: 'All secrets', shape: [{ id: '' }], dsl: { from: ['secrets'], fields: ['secrets.id'] } },
];
const nowhere: Query = { from: ['nowhere'], fields: ['nowhere.id'] };

type Engines = { open: QueryEngine; denying: QueryEngine; tenant: QueryEngine };
type Reply = { status: number; body: Record<string, unknown> };
type Post = (config: { engine: QueryEngine; locked?: boolean }, body: unknown, scope?: ScopeValues) => Promise<Reply>;

const enginesOf = async (core: Core, adapter: DatabaseAdapter): Promise<Engines> => {
  const engineOf = async (config: Partial<QueryEngineConfig>): Promise<QueryEngine> => {
    const engine = core.createQueryEngine({ adapter, ...config });
    await engine.introspect();
    await core.seedCache(engine.cache, SEEDS);
    return engine;
  };
  const open = await engineOf({});
  await open.cache.set('broken/dsl', { kind: 'ok', dsl: nowhere, shape: [{ id: '' }], protected: true, createdAt: Date.now() });
  return { open, denying: await engineOf({ scope: notesOnly }), tenant: await engineOf({ scope: byTenant }) };
};

const throughHono =
  (entry: HonoEntry): Post =>
  async (config, body, scope = {}) => {
    const res = await entry
      .vex({ ...config, getScope: () => scope })
      .request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

const throughExpress =
  (entry: ExpressEntry): Post =>
  async (config, body, scope = {}) => {
    const reply: Reply = { status: 200, body: {} };
    const res: VexExpressResponse = {
      status: (code) => {
        reply.status = code;
        return res;
      },
      json: (sent) => {
        reply.body = sent as Record<string, unknown>;
        return res;
      },
    };
    await entry.vex({ ...config, getScope: () => scope })({ method: 'POST', body, query: {} }, res);
    return reply;
  };

// Every code the engine throws on a read, and the status DOCS.md gives it.
const READS: ReadonlyArray<{ code: string; status: number; ask: (post: Post, engines: Engines) => Promise<Reply> }> = [
  { code: 'cache_miss', status: 404, ask: (post, { open }) => post({ engine: open }, { fingerprint: 'nope/nothing' }) },
  {
    code: 'fingerprint_protected',
    status: 409,
    ask: (post, { open }) => post({ engine: open }, { fingerprint: 'notes/all', intent: 'Something else', shape: [{ id: '', body: '' }] }),
  },
  { code: 'locked', status: 400, ask: (post, { open }) => post({ engine: open, locked: true }, { intent: 'All notes', shape: [{ id: '' }] }) },
  { code: 'agent_failed', status: 400, ask: (post, { open }) => post({ engine: open }, { intent: 'All notes', shape: [{ id: '' }] }) },
  { code: 'scope_denied', status: 400, ask: (post, { denying }) => post({ engine: denying }, { fingerprint: 'secrets/all', context: {} }) },
  { code: 'invalid_dsl', status: 400, ask: (post, { open }) => post({ engine: open }, { fingerprint: 'broken/dsl', context: {} }) },
];

const PAIRS = [
  { name: 'CommonJS engine, CommonJS hono', engines: 'commonjs', post: 'commonjs hono' },
  { name: 'CommonJS engine, CommonJS express', engines: 'commonjs', post: 'commonjs express' },
  { name: 'ESM engine, CommonJS hono', engines: 'esm', post: 'commonjs hono' },
  { name: 'CommonJS engine, ESM hono', engines: 'commonjs', post: 'esm hono' },
] as const;

describe('the built entries, one class in several copies', () => {
  const db = new PGlite();
  let core: Core;
  let esmCore: Core;
  let adapter: DatabaseAdapter;
  let engines: Record<(typeof PAIRS)[number]['engines'], Engines>;
  let posts: Record<(typeof PAIRS)[number]['post'], Post>;
  let logged: string[];

  beforeAll(async () => {
    await db.exec(DDL);
    core = commonjs<Core>('index');
    esmCore = await esm<Core>('index');
    const pool: PgPool = commonjs<PgliteEntry>('adapters/pglite/index').createPglitePool(db);
    const esmPool: PgPool = (await esm<PgliteEntry>('adapters/pglite/index')).createPglitePool(db);
    adapter = core.createPostgresAdapter({ pool });
    engines = {
      commonjs: await enginesOf(core, adapter),
      esm: await enginesOf(esmCore, esmCore.createPostgresAdapter({ pool: esmPool })),
    };
    posts = {
      'commonjs hono': throughHono(commonjs<HonoEntry>('adapters/hono/index')),
      'commonjs express': throughExpress(commonjs<ExpressEntry>('adapters/express/index')),
      'esm hono': throughHono(await esm<HonoEntry>('adapters/hono/index')),
    };
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(String(args[0]));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const unhandled = (): string[] => logged.filter((line) => line.startsWith('[vex] unhandled error'));

  describe.each(PAIRS)('$name', (pair) => {
    it.each(READS)('answers $code with $status', async ({ code, status, ask }) => {
      const reply = await ask(posts[pair.post], engines[pair.engines]);
      expect(reply.body['error']).toBe(code);
      expect(reply.status).toBe(status);
      expect(unhandled()).toEqual([]);
    });

    it("keeps an error's details in the reply", async () => {
      const reply = await posts[pair.post]({ engine: engines[pair.engines].open }, { fingerprint: 'broken/dsl', context: {} });
      expect(reply.body['details']).toBeDefined();
    });

    it('answers missing_scope with a 500 that keeps the key names in the log', async () => {
      const reply = await posts[pair.post]({ engine: engines[pair.engines].tenant }, { fingerprint: 'notes/all', context: {} });
      expect(reply.status).toBe(500);
      expect(reply.body).toEqual({ error: 'missing_scope', message: 'The server did not supply the scope this request needs.' });
      expect(logged.some((line) => line.startsWith('[vex] refused a statement the host did not scope'))).toBe(true);
      expect(unhandled()).toEqual([]);
    });
  });

  describe('the agent entry', () => {
    // A model that describes itself and then cannot be reached: the run fails,
    // and the hook says so with the agent entry's own copy of VexError.
    const unreachable = (): never => {
      throw new Error('no model here');
    };
    const llm: SignalClient = {
      step: unreachable,
      stepStream: unreachable,
      count: unreachable,
      describe: () => ({
        provider: 'stub',
        model: 'stub-model',
        kind: 'chat',
        modelKnown: false,
        capabilities: {
          nativeTools: true,
          nativeJsonSchema: false,
          nativeJsonMode: true,
          toolsWithStructuredOutput: false,
          validatesToolArgs: false,
          manglesNestedToolArgs: false,
          multimodal: false,
          supportsEmbedding: false,
        },
      }),
    };

    it.each(['commonjs hono', 'commonjs express'] as const)('its agent_failed is a 400 through %s', async (post) => {
      const agent = commonjs<AgentEntry>('agent/index');
      const engine = core.createQueryEngine({ adapter, generateDsl: agent.createQueryDsl({ llm, queryJsonSchema: {} }) });
      await engine.introspect();
      const reply = await posts[post]({ engine }, { intent: 'All notes', shape: [{ id: '' }] });
      expect(reply.body['error']).toBe('agent_failed');
      expect(reply.status).toBe(400);
      expect(unhandled()).toEqual([]);
    });

    it("the engine negative-caches an 'unsatisfiable' made by another copy of the class", async () => {
      let asked = 0;
      const engine = core.createQueryEngine({
        adapter,
        generateDsl: async () => {
          asked += 1;
          throw new esmCore.VexError('unsatisfiable', 'nothing here answers that');
        },
      });
      await engine.introspect();
      const ask = { intent: 'How many unicorns are there', shape: [{ unicorns: 0 }], context: {} };
      await expect(engine.execute(ask)).rejects.toMatchObject({ code: 'unsatisfiable' });
      await expect(engine.execute(ask)).rejects.toMatchObject({ code: 'unsatisfiable' });
      expect(asked).toBe(1);
    });
  });
});

import { createPostgresAdapter, createPostgresCache, createQueryEngine, createScopePolicy, handleDiscovery, handleQuery, scopeGrants, seedCache } from '@niscorp/vex';
import type { QueryEngine, ScopePolicy } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import { resolvePrincipal } from '@niscorp/charter';
import type { SignalClient } from '@niscorp/cortex';
import { randomUUID } from 'node:crypto';
import type { ActionDefinition, FetchFn, Shell } from '@niscorp/nova';
import type { NiscRuntime } from '@niscorp/moss';
import { CHARTER } from '@relay/app/charter';
import { scopeBehaviors } from '@relay/app/vex/behaviors';
import { ENTRIES, MUTATION_ENTRIES } from '@relay/app/vex';
import { resourceEntities } from '@relay/app/vex/resources';
import { TABLES } from '@relay/db/schema';
import { llmFor, type AgentRole } from '@relay/server/llm';
import type { RayContext } from '@relay/server/functions/ray';
import { devRuntime, type DevRuntime } from '../server/runtime';

export type RayEngine = { engine: QueryEngine; db: NiscRuntime['db'] };

export const policyOf = (roles: readonly string[]): ScopePolicy => createScopePolicy(resolvePrincipal(CHARTER, scopeGrants(TABLES), roles, 'data'), scopeBehaviors);

export const systemPolicy = policyOf(['system']);

const buildLlm = (role: AgentRole): SignalClient => {
  const resolved = llmFor(role);
  if ('error' in resolved) throw new Error(resolved.error);
  return resolved.llm;
};

// The dev scripts' own engine over the app's entries. The server keeps the
// entries it serves to itself, and the running app has no engine beside it.
const boot = async (runtime: NiscRuntime, policy: ScopePolicy): Promise<RayEngine> => {
  const adapter = createPostgresAdapter({ pool: runtime.pool });
  const cache = runtime.cache ?? createPostgresCache({ pool: runtime.pool });
  await cache.init?.();
  await seedCache(cache, [...ENTRIES, ...MUTATION_ENTRIES]);
  // The DSL JSON Schema is static; a throwaway engine yields it without
  // touching the DB. generateDsl needs it before the real engine exists.
  const dslJsonSchema = createQueryEngine({ adapter }).getDslSchema();
  const engine = createQueryEngine({
    adapter,
    scope: policy,
    cache,
    generateDsl: (request, schema, caller) =>
      createQueryDsl({ llm: buildLlm('query'), queryJsonSchema: dslJsonSchema })(request, schema, caller),
    mapToShape: (rows, shape) => createShapeMapper(buildLlm('shape'))(rows, shape),
  });
  await engine.introspect();
  return { engine, db: runtime.db };
};

// One engine, with its introspection, for each policy object on each pool.
const memo = new WeakMap<object, Map<ScopePolicy, Promise<RayEngine>>>();

export const rayEngine = (runtime: NiscRuntime, policy: ScopePolicy): Promise<RayEngine> => {
  const perPolicy = memo.get(runtime.pool) ?? new Map<ScopePolicy, Promise<RayEngine>>();
  memo.set(runtime.pool, perPolicy);
  const hit = perPolicy.get(policy);
  if (hit !== undefined) return hit;
  const made = boot(runtime, policy);
  perPolicy.set(policy, made);
  return made;
};

// One database for every call a dev script makes: devRuntime makes a new one each
// time, and a query generated through one call is replayed through the next.
let database: Promise<DevRuntime> | undefined;
const sharedRuntime = (): Promise<DevRuntime> => (database ??= devRuntime());

let booted: Promise<RayEngine> | undefined;
export const getVexRuntime = (): Promise<RayEngine> => {
  booted ??= (async () => rayEngine(await sharedRuntime(), systemPolicy))();
  return booted;
};

const notHere =
  (what: string) =>
  (): never => {
    throw new Error(`no ${what} in this harness: it runs without a session`);
  };

// What ray asks of a session, answered by the dev engine instead: the wire and
// the intent writer run a query the way the server's routes would, and the
// draft and the saves are not here.
export const devRayContext = (options: { shell?: Shell; userId?: string; roles?: readonly string[]; wire?: FetchFn } = {}): RayContext => {
  const userId = options.userId ?? 'usr_001';
  const policy = options.roles === undefined ? systemPolicy : policyOf(options.roles);
  const engineOf = async (): Promise<RayEngine> => rayEngine(await sharedRuntime(), policy);
  // Mirrors moss's session wire, which unwraps a vex reply before the endpoint sees it.
  const unwrap = (status: number, body: unknown): Awaited<ReturnType<FetchFn>> => {
    const result = status < 400 && body !== null && typeof body === 'object' && 'result' in body ? (body as Record<string, unknown>)['result'] : body;
    return { ok: status < 400, status, json: () => Promise.resolve(result), text: () => Promise.resolve(JSON.stringify(result)) };
  };
  const wire: FetchFn =
    options.wire ??
    (async (url, init) => {
      const parsed = new URL(url, 'http://relay.local');
      const entities = resourceEntities(parsed.pathname);
      const { engine, db } = await engineOf();
      if ((init?.method ?? 'GET').toUpperCase() === 'GET') return unwrap(200, await handleDiscovery({ engine, entities, scopePolicy: policy }));
      const body: unknown = init?.body !== undefined ? JSON.parse(init.body) : {};
      const res = await handleQuery({ engine, entities, locked: true, scopePolicy: policy, mutations: { client: db, policy } }, body, { userId });
      return unwrap(res.status, res.body);
    });
  const shell = options.shell;
  // With a shell: what the draft does for a screen, as far as this harness goes. It is registered on the shell, and kept nowhere.
  const draft: RayContext['draft'] =
    shell === undefined
      ? { add: notHere('draft'), list: () => [], remove: notHere('draft'), show: notHere('draft'), discard: notHere('draft'), save: notHere('draft') }
      : {
          add: async (artifacts) => ({
            step: 1,
            artifacts: artifacts.map((artifact) => {
              const id = artifact.id ?? (artifact.kind === 'action' ? `generated.${randomUUID()}` : randomUUID());
              if (artifact.kind === 'action' && artifact.body !== null && typeof artifact.body === 'object') shell.registerAction({ ...(artifact.body as Record<string, unknown>), id } as ActionDefinition);
              return { kind: artifact.kind, id };
            }),
          }),
          list: () => [],
          remove: async () => ({ step: 1 }),
          show: async () => undefined,
          discard: async () => undefined,
          save: async () => ({ save: 'nowhere', artifacts: [] }),
        };
  return {
    get shell(): Shell {
      if (shell === undefined) throw new Error('no session shell in this harness');
      return shell;
    },
    userId,
    wire,
    answerIntent: async (asked) => (await engineOf()).engine.execute({ ...asked, context: asked.context ?? {} }, { scope: { userId } }),
    draft,
    artifacts: { save: notHere('saves'), list: async () => [], history: async () => [], restore: notHere('saves'), reset: notHere('saves') },
  };
};

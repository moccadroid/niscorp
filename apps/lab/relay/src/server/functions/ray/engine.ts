import { createPostgresAdapter, createPostgresCache, createQueryEngine } from '@niscorp/vex';
import type { QueryEngine, ScopePolicy } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import type { Shell } from '@niscorp/nova';
import type { NiscRuntime } from '@niscorp/moss';
import { llmFor, type AgentRole } from '@relay/server/llm';

export type RayEngine = { engine: QueryEngine; db: NiscRuntime['db'] };

// `policyFor` must answer the same object for the same roles each time: an
// engine, with its introspection, is kept for each policy object.
export type RaySeams = {
  runtime: NiscRuntime;
  policyFor: (roles: readonly string[]) => ScopePolicy;
};

export type RayContext = {
  shell: Shell;
  userId: string;
  policy: ScopePolicy;
  engine: () => Promise<RayEngine>;
};

// Rebuilt per call from the role's current assignment, so a change in Settings
// takes effect without rebuilding the memoized engine.
const buildLlm = (role: AgentRole): SignalClient => {
  const resolved = llmFor(role);
  if ('error' in resolved) throw new Error(resolved.error);
  return resolved.llm;
};

const boot = async (runtime: NiscRuntime, policy: ScopePolicy): Promise<RayEngine> => {
  const adapter = createPostgresAdapter({ pool: runtime.pool });
  const cache = runtime.cache ?? createPostgresCache({ pool: runtime.pool });
  await cache.init?.();
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

const memo = new WeakMap<object, Map<ScopePolicy, Promise<RayEngine>>>();

export const rayEngine = (runtime: NiscRuntime, policy: ScopePolicy): Promise<RayEngine> => {
  const perPolicy = memo.get(runtime.pool) ?? new Map<ScopePolicy, Promise<RayEngine>>();
  memo.set(runtime.pool, perPolicy);
  const hit = perPolicy.get(policy);
  if (hit !== undefined) return hit;
  const booted = boot(runtime, policy);
  perPolicy.set(policy, booted);
  return booted;
};

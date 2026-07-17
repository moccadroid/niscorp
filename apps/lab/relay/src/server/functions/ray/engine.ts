import { createPostgresAdapter, createPostgresCache, createQueryEngine } from '@niscorp/vex';
import type { QueryEngine, ScopePolicy } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import type { Shell } from '@niscorp/nova';
import type { NiscRuntime } from '@niscorp/moss';
import { getKey, createLlmClient } from '@relay/server/llm';

// ═══════════════════════════════════════════════════════════
// Ray's engine — dynamic vex over WHATEVER environment is handed in (the
// server's runtime in the app, devDatabase in checks), under an explicit
// scope policy. This is the generative path: a novel shape invokes the
// reference agents (query DSL + shape mapper); a warm shape replays from
// the same cache the app surface seeds. The locked /api mounts refuse
// novel shapes by design — agents come HERE instead.
//
// One engine per (environment, policy): an agent runs under its CALLER's
// compiled policy, so it reads what the caller reads and is refused what
// the caller is refused. Nothing here grants authority of its own.
// ═══════════════════════════════════════════════════════════

export type RayEngine = { engine: QueryEngine; db: NiscRuntime['db'] };

// What Ray's tools close over — the session, from moss's function seam:
// the living shell, who is asking, their policy, and the lazy engine.
export type RayContext = {
  shell: Shell;
  userId: string;
  policy: ScopePolicy;
  engine: () => Promise<RayEngine>;
};

// The LLM, rebuilt per call from the environment key — a missing key
// throws a readable error; warm cache replays never reach here.
const buildLlm = (): SignalClient => {
  const key = getKey();
  if (key === undefined) throw new Error('No LLM key in the environment — set GROQ_API_KEY (or OPENROUTER_API_KEY) in .env.');
  return createLlmClient(key);
};

const boot = async (runtime: NiscRuntime, policy: ScopePolicy): Promise<RayEngine> => {
  const adapter = createPostgresAdapter({ pool: runtime.pool });
  const cache = runtime.cache ?? createPostgresCache({ pool: runtime.pool });
  await cache.init?.();
  // The DSL JSON Schema is static; a throwaway probe yields it without
  // touching the DB. The generateDsl hook needs it up front.
  const dslJsonSchema = createQueryEngine({ adapter }).getDslSchema();
  const engine = createQueryEngine({
    adapter,
    scope: policy,
    cache,
    generateDsl: (request, schema) =>
      createQueryDsl({ adapter, llm: buildLlm(), scopePolicy: policy, schema, queryJsonSchema: dslJsonSchema })(request, schema),
    mapToShape: (rows, shape) => createShapeMapper(buildLlm())(rows, shape),
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

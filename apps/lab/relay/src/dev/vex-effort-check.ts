import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createMemoryCache, createPostgresAdapter, createQueryEngine, seedCache, type QueryEngine } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import { ENTRIES, MUTATION_ENTRIES } from '@relay/app/vex';
import { MODELS, type ReasoningEffort } from '@relay/server/llm';
import { devRuntime } from '../server/runtime';
import { policyOf } from './engine';
import { turnsOf } from './turns';

// vex's query writer and shape mapper on the same queries at two efforts: each query in a fresh cache, so every
// one is written by the model. Usage: vex-effort-check <queries.json> <out.json> [perScreen] [reps]
type Query = { screen: string; intent: string; shape: unknown; context: Record<string, unknown> };
type Turn = Record<string, unknown> & { ms?: number; finish?: string; usage?: { inputTokens: number; outputTokens: number; reported: boolean } };
type Outcome = { screen: string; at: number; effort: ReasoningEffort; rep: number; ms: number; ok: boolean; error?: string; rows?: number; digest?: string; sample?: unknown; turns: Turn[] };

const [source = '', target = '', perScreen = '4', reps = '2'] = process.argv.slice(2);
const all = JSON.parse(readFileSync(source, 'utf8')) as Query[];
const kept = new Map<string, number>();
const queries = all.filter((query) => {
  const count = kept.get(query.screen) ?? 0;
  kept.set(query.screen, count + 1);
  return count < Number(perScreen);
});

process.loadEnvFile('.env');
const current = new AsyncLocalStorage<Turn[]>();
const entry = MODELS['groq-120b'];
const key = entry.getKey();
if (key === undefined) throw new Error(`no ${entry.envKey}`);

const runtime = await devRuntime();
const adapter = createPostgresAdapter({ pool: runtime.pool });
const dslJsonSchema = createQueryEngine({ adapter }).getDslSchema();
const policy = policyOf(['sales', 'dev']);

const engineAt = async (effort: ReasoningEffort): Promise<QueryEngine> => {
  const llm = turnsOf(entry.create(key, effort), (turn) => current.getStore()?.push(turn as Turn));
  const cache = createMemoryCache();
  await seedCache(cache, [...ENTRIES, ...MUTATION_ENTRIES]);
  const engine = createQueryEngine({
    adapter,
    scope: policy,
    cache,
    generateDsl: (request, schema, caller) => createQueryDsl({ llm, queryJsonSchema: dslJsonSchema })(request, schema, caller),
    mapToShape: (rows, shape, intent) => createShapeMapper(llm)(rows, shape, intent),
  });
  await engine.introspect();
  return engine;
};

// Rows compared as sets of records with sorted keys: a query that answers the same rows in another column order is the same.
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical).map((one) => JSON.stringify(one)).sort()
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, inner]) => [key, canonical(inner)]))
      : value;
const digestOf = (rows: unknown): string => createHash('sha1').update(JSON.stringify(canonical(rows))).digest('hex').slice(0, 10);

const outcomes: Outcome[] = [];
const jobs: (() => Promise<void>)[] = [];
for (const effort of ['medium', 'high'] as const) {
  for (let rep = 1; rep <= Number(reps); rep++) {
    queries.forEach((query, at) => {
      jobs.push(async () => {
        const engine = await engineAt(effort);
        const turns: Turn[] = [];
        const t0 = Date.now();
        await current.run(turns, async () => {
          try {
            const response = await engine.execute({ intent: query.intent, shape: query.shape as never, context: query.context }, { scope: { userId: 'usr_001' } });
            const rows = response.result;
            const missing = response.meta.missingContext ?? [];
            outcomes.push({ screen: query.screen, at, effort, rep, ms: Date.now() - t0, ok: missing.length === 0, ...(missing.length > 0 ? { error: `missing ${missing.join(', ')}` } : {}), rows: Array.isArray(rows) ? rows.length : 1, digest: digestOf(rows), sample: Array.isArray(rows) ? rows.slice(0, 3) : rows, turns });
          } catch (error) {
            outcomes.push({ screen: query.screen, at, effort, rep, ms: Date.now() - t0, ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 300), turns });
          }
        });
      });
    });
  }
}

let next = 0;
const worker = async (): Promise<void> => {
  while (next < jobs.length) {
    const job = jobs[next];
    next += 1;
    await job?.();
    if (outcomes.length % 20 === 0) console.log(`${outcomes.length}/${jobs.length}`);
  }
};
await Promise.all(Array.from({ length: 4 }, worker));
writeFileSync(target, JSON.stringify(outcomes, null, 1));
console.log(`${outcomes.length} outcomes → ${target}`);
process.exit(0);

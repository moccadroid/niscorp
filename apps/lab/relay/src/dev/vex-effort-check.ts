import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createMemoryCache, createPostgresAdapter, createQueryEngine, seedCache, type GenerateDsl, type QueryEngine } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import { createSignal } from '@niscorp/signal';
import type { Selection } from '@relay/context-selection';
import { ENTRIES, MUTATION_ENTRIES } from '@relay/app/vex';
import { MODELS } from '@relay/server/llm';
import { DSL_SPEC, queryWriter, shapeWriter } from '@relay/server/functions/ray/writers';
import { devRuntime } from '../server/runtime';
import { policyOf } from './engine';
import { turnsOf } from './turns';

// vex's query writer and shape mapper on the same queries in several setups, at medium effort, each query in a fresh
// cache so every one is written by the model: "vex" (vex's own writers), "compact" (relay's: compact schema and DSL,
// declared formats), "jev" (relay's, with Jev picking the entities).
// Usage: vex-effort-check <queries.json> <out.json> [perScreen] [reps] [variants]
type Query = { screen: string; intent: string; shape: unknown; context: Record<string, unknown> };
type Turn = Record<string, unknown> & { ms?: number; finish?: string; usage?: { inputTokens: number; outputTokens: number; reported: boolean } };
type Run = { turns: Turn[]; entities?: string[]; selection?: Selection };
type Outcome = Run & { screen: string; at: number; variant: string; rep: number; ms: number; ok: boolean; error?: string; rows?: number; digest?: string; sample?: unknown };

const [source = '', target = '', perScreen = '2', reps = '1', variantList = 'vex,compact,jev'] = process.argv.slice(2);
const variants = variantList.split(',');
const all = JSON.parse(readFileSync(source, 'utf8')) as Query[];
const kept = new Map<string, number>();
const queries = all.filter((query) => {
  const count = kept.get(query.screen) ?? 0;
  kept.set(query.screen, count + 1);
  return count < Number(perScreen);
});

process.loadEnvFile('.env');
const current = new AsyncLocalStorage<Run>();
const entry = MODELS['groq-120b'];
const key = entry.getKey();
if (key === undefined) throw new Error(`no ${entry.envKey}`);
if (variants.includes('jev') && (process.env['TYPESAFE_API_KEY'] ?? '') === '') throw new Error('the jev variant needs TYPESAFE_API_KEY in .env');
const decider = variants.includes('jev') ? createSignal('typesafe') : undefined;

const runtime = await devRuntime();
const adapter = createPostgresAdapter({ pool: runtime.pool });
const dslJsonSchema = createQueryEngine({ adapter }).getDslSchema();
const policy = policyOf(['sales', 'dev']);

// The entities a written query reads: those in its from, and in the from of every query nested in it.
const entitiesOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(entitiesOf);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const from = Array.isArray(record['from']) ? record['from'].filter((one): one is string => typeof one === 'string') : [];
  return [...new Set([...from, ...Object.values(record).flatMap(entitiesOf)])];
};

const engineFor = async (variant: string): Promise<QueryEngine> => {
  const llm = turnsOf(entry.create(key, 'medium'), (turn) => current.getStore()?.turns.push(turn as Turn));
  const writer: GenerateDsl =
    variant === 'vex'
      ? createQueryDsl({ llm, queryJsonSchema: dslJsonSchema })
      : queryWriter(llm, DSL_SPEC, variant === 'jev' && decider !== undefined ? { decider, onSelect: (selection) => { const run = current.getStore(); if (run !== undefined) run.selection = selection; } } : undefined);
  const cache = createMemoryCache();
  await seedCache(cache, [...ENTRIES, ...MUTATION_ENTRIES]);
  const engine = createQueryEngine({
    adapter,
    scope: policy,
    cache,
    generateDsl: async (request, schema, caller) => {
      const dsl = await writer(request, schema, caller);
      const run = current.getStore();
      if (run !== undefined) run.entities = entitiesOf(dsl);
      return dsl;
    },
    mapToShape: variant === 'vex' ? createShapeMapper(llm) : shapeWriter(llm),
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
for (const variant of variants) {
  for (let rep = 1; rep <= Number(reps); rep++) {
    queries.forEach((query, at) => {
      jobs.push(async () => {
        const engine = await engineFor(variant);
        const run: Run = { turns: [] };
        const t0 = Date.now();
        await current.run(run, async () => {
          try {
            const response = await engine.execute({ intent: query.intent, shape: query.shape as never, context: query.context }, { scope: { userId: 'usr_001' } });
            const rows = response.result;
            const missing = response.meta.missingContext ?? [];
            outcomes.push({ ...run, screen: query.screen, at, variant, rep, ms: Date.now() - t0, ok: missing.length === 0, ...(missing.length > 0 ? { error: `missing ${missing.join(', ')}` } : {}), rows: Array.isArray(rows) ? rows.length : 1, digest: digestOf(rows), sample: Array.isArray(rows) ? rows.slice(0, 3) : rows });
          } catch (error) {
            outcomes.push({ ...run, screen: query.screen, at, variant, rep, ms: Date.now() - t0, ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) });
          }
        });
      });
    });
  }
}

// Two at a time: Groq counts 250k tokens a minute per model, and more in flight runs into it.
let next = 0;
const worker = async (): Promise<void> => {
  while (next < jobs.length) {
    const job = jobs[next];
    next += 1;
    await job?.();
    if (outcomes.length % 10 === 0) console.log(`${outcomes.length}/${jobs.length}`);
  }
};
await Promise.all(Array.from({ length: 2 }, worker));
writeFileSync(target, JSON.stringify(outcomes, null, 1));
console.log(`${outcomes.length} outcomes → ${target}`);
process.exit(0);

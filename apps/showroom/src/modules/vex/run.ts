import { handleQuery, lintMutation } from '@niscorp/vex';
import type { VexEvent, Query, ScopeValues } from '@niscorp/vex';
import { compile } from '@niscorp/prism';
import { deepEqual } from '@showroom/lib/deep-equal';
import type { VexRuntime } from './runtime/boot';
import { mutationPolicy, scopePolicy } from './runtime/scope';
import type { VexScenario } from './scenarios';

// The engine runs the mapping once over the whole row set as { result: rows },
// so this returns the rows array unchanged.
const IDENTITY_MAPPING = { $ref: '$.result' };

export type ParamMeta = { type: string; kind: 'context' | 'scope' | 'semantic' };

export type RunOutcome = {
  ok: boolean;
  error?: string;
  errorCode?: string;
  status?: number;
  dsl?: Query;
  sql?: string;
  rows: unknown[];
  warnings: string[];
  params: Record<string, ParamMeta>;
  missingContext?: string[];
  cacheHit: boolean;
  generated: boolean;
  live: boolean;
  fingerprint?: string;
  timing: { agentMs?: number; executionMs?: number; mappingMs?: number; totalMs?: number };
  events: VexEvent[];
};

const messageOf = (err: unknown): string => {
  // The agents (cortex/prism) can reject with a plain object, which `String` turns into "[object Object]".
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err !== null && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    if (typeof rec.message === 'string') return rec.message;
    try { return JSON.stringify(err, null, 2); } catch { }
  }
  return String(err);
};

const dslFromEvents = (events: VexEvent[], fallback?: Query): Query | undefined => {
  for (const e of events) if (e.type === 'query.dsl') return e.dsl as Query;
  return fallback;
};

export type RunOptions = {
  context: Record<string, unknown>;
  scope?: ScopeValues;
  live: boolean;
  onEvent?: (event: VexEvent) => void;
};

const readerOf = (opts: RunOptions): { scope?: ScopeValues; scopePolicy?: typeof scopePolicy } =>
  opts.scope === undefined ? {} : { scope: opts.scope, scopePolicy };

export const runScenario = async (
  runtime: VexRuntime,
  scenario: VexScenario,
  opts: RunOptions,
): Promise<RunOutcome> => {
  const events: VexEvent[] = [];
  const unsubscribe = runtime.subscribe((e) => {
    events.push(e);
    opts.onEvent?.(e);
  });

  try {
    if (scenario.mode === 'mutate') {
      const fingerprint = `vex-demo/${scenario.id}`;
      let cacheHit = false;
      let generated = false;
      try {
        if (scenario.mutation !== undefined) {
          const issues = lintMutation(scenario.mutation);
          if (issues.length > 0) throw new Error(`seed refused: ${issues.join('; ')}`);
          const existing = await runtime.engine.cache.get(fingerprint);
          const warm = existing?.kind === 'mutation' && deepEqual(existing.mutation, scenario.mutation);
          if (warm) {
            cacheHit = true;
          } else {
            generated = true;
            await runtime.engine.cache.set(fingerprint, {
              kind: 'mutation',
              mutation: scenario.mutation,
              intent: scenario.intent,
              shape: scenario.shape,
              schemaFingerprint: runtime.fingerprint,
              createdAt: Date.now(),
            });
          }
        }
        const body = scenario.body ?? { fingerprint, context: opts.context };
        const started = performance.now();
        const res = await handleQuery(
          { engine: runtime.engine, mutations: { client: runtime.db, policy: mutationPolicy } },
          body,
          opts.scope ?? {},
        );
        const executionMs = performance.now() - started;
        const resBody = res.body as Record<string, unknown>;
        if (res.status !== 200) {
          return {
            ok: false,
            error: `${res.status} ${String(resBody.error)} — ${String(resBody.message)}`,
            errorCode: String(resBody.error),
            status: res.status,
            rows: [],
            warnings: [],
            params: {},
            cacheHit,
            generated,
            live: false,
            fingerprint,
            timing: {},
            events,
          };
        }
        const result = resBody.result;
        return {
          ok: true,
          status: res.status,
          rows: Array.isArray(result) ? result : [result],
          warnings: [],
          params: {},
          cacheHit,
          generated,
          live: false,
          fingerprint,
          timing: { executionMs, totalMs: executionMs },
          events,
        };
      } catch (err) {
        return {
          ok: false,
          error: messageOf(err),
          rows: [],
          warnings: [],
          params: {},
          cacheHit,
          generated,
          live: false,
          fingerprint,
          timing: {},
          events,
        };
      }
    }

    const readDsl = scenario.dsl;
    if (readDsl === undefined) {
      return { ok: false, error: `scenario "${scenario.id}" has no DSL`, rows: [], warnings: [], params: {}, cacheHit: false, generated: false, live: false, timing: {}, events };
    }

    if (scenario.mode === 'compile') {
      try {
        const compiled = runtime.engine.compile(readDsl);
        return {
          ok: true,
          dsl: readDsl,
          sql: compiled.sql,
          rows: [],
          warnings: [],
          params: {},
          cacheHit: false,
          generated: false,
          live: false,
          timing: {},
          events,
        };
      } catch (err) {
        return {
          ok: false,
          error: messageOf(err),
          dsl: readDsl,
          rows: [],
          warnings: [],
          params: {},
          cacheHit: false,
          generated: false,
          live: false,
          timing: {},
          events,
        };
      }
    }

    const fingerprint = `vex-demo/${scenario.id}`;

    let cacheHit = false;
    let generated = false;
    let live = false;

    try {
      if (opts.live) {
        // The slot is cleared first: an unknown fingerprint sent with intent +
        // shape generates and fills it.
        live = true;
        generated = true;
        await runtime.engine.cache.delete(fingerprint);
        const res = await runtime.engine.execute(
          { fingerprint, intent: scenario.intent, shape: scenario.shape, context: opts.context },
          { ...readerOf(opts), ...(scenario.locked === true ? { locked: true } : {}) },
        );
        return toOutcome(res, events, scenario, { cacheHit, generated, live });
      }

      const existing = await runtime.engine.cache.get(fingerprint);
      const warm = existing?.kind === 'ok' && deepEqual(existing.dsl, readDsl);
      if (warm) {
        cacheHit = true;
      } else {
        // The seeded Prism IR lets the engine map rows without calling the LLM.
        generated = true;
        const prismIr = await compile(scenario.mapping ?? IDENTITY_MAPPING);
        await runtime.engine.cache.set(fingerprint, {
          kind: 'ok',
          dsl: readDsl,
          prismIr,
          intent: scenario.intent,
          shape: scenario.shape,
          schemaFingerprint: runtime.fingerprint,
          createdAt: Date.now(),
        });
      }
      const res = await runtime.engine.execute(
        { fingerprint, context: opts.context },
        readerOf(opts),
      );
      return toOutcome(res, events, scenario, { cacheHit, generated, live });
    } catch (err) {
      console.error('[vex] run failed', err);
      return {
        ok: false,
        error: messageOf(err),
        dsl: dslFromEvents(events, readDsl),
        rows: [],
        warnings: [],
        params: {},
        cacheHit,
        generated,
        live,
        fingerprint,
        timing: {},
        events,
      };
    }
  } finally {
    unsubscribe();
  }
};

type ExecuteResponse = Awaited<ReturnType<VexRuntime['engine']['execute']>>;

const sqlFromEvents = (events: VexEvent[]): string | undefined => {
  for (const e of events) if (e.type === 'query.sql') return e.sql;
  return undefined;
};

const toOutcome = (
  res: ExecuteResponse,
  events: VexEvent[],
  scenario: VexScenario,
  flags: { cacheHit: boolean; generated: boolean; live: boolean },
): RunOutcome => ({
  ok: true,
  dsl: dslFromEvents(events, scenario.dsl),
  sql: sqlFromEvents(events),
  rows: Array.isArray(res.result) ? res.result : [res.result],
  warnings: res.meta.warnings ?? [],
  params: res.meta.context as Record<string, ParamMeta>,
  missingContext: res.meta.missingContext,
  cacheHit: flags.cacheHit,
  generated: flags.generated,
  live: flags.live,
  fingerprint: res.meta.cache.fingerprint,
  timing: { ...res.meta.timing, totalMs: lastTotal(events) },
  events,
});

const lastTotal = (events: VexEvent[]): number | undefined => {
  for (const e of events) if (e.type === 'query.done') return e.totalMs;
  return undefined;
};

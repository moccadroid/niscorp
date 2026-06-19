import { computeShapeHash } from '@niscorp/vex';
import type { VexEvent, Query, ScopeValues } from '@niscorp/vex';
import { compile } from '@niscorp/prism';
import { deepEqual } from '@showroom/lib/deep-equal';
import type { VexRuntime } from './runtime/boot';
import type { VexScenario } from './scenarios';

// Identity Prism transform. The engine runs the mapping once over the whole
// row set as { result: rows }, so this returns the rows array unchanged — used
// when the rows already match the requested shape, so no LLM mapping is needed.
const IDENTITY_MAPPING = { $ref: '$.result' };

// ═══════════════════════════════════════════════════════════
// runScenario — drives one pass of the real engine for a scenario
// and returns everything the visualizer needs: the captured event
// stream, the compiled SQL, rows, cache verdict, warnings, timing.
//
// Two execution shapes:
//  - 'compile' scenarios call engine.compile directly (analyzer demos
//    that are meant to be rejected before SQL exists).
//  - 'execute' scenarios run the cached pipeline. Canned (no key):
//    if the shape isn't already warm with this DSL we seed it (that's
//    the "generation" the LLM would do) and run a HIT; re-runs reuse
//    it. Live: cache:'refresh' forces a real LLM generation.
// ═══════════════════════════════════════════════════════════

export type ParamMeta = { type: string; kind: 'context' | 'scope' | 'semantic' };

export type RunOutcome = {
  ok: boolean;
  error?: string;
  dsl: Query;
  sql?: string;
  rows: unknown[];
  warnings: string[];
  params: Record<string, ParamMeta>;
  missingContext?: string[];
  cacheHit: boolean; // logical: was this shape already warm with this DSL?
  generated: boolean; // did this run (re)create the DSL?
  live: boolean; // did a real LLM generation run?
  cacheKey?: string;
  timing: { agentMs?: number; executionMs?: number; mappingMs?: number; totalMs?: number };
  events: VexEvent[];
};

const messageOf = (err: unknown): string => {
  // Surface the real failure. The agents (cortex/prism) can reject with a
  // plain object, which would otherwise stringify to "[object Object]".
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err !== null && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    if (typeof rec.message === 'string') return rec.message;
    try { return JSON.stringify(err, null, 2); } catch { /* fall through */ }
  }
  return String(err);
};

// The DSL actually used — the LLM-generated one in live mode (from the
// query.dsl event), else the scenario's own DSL.
const dslFromEvents = (events: VexEvent[], fallback: Query): Query => {
  for (const e of events) if (e.type === 'query.dsl') return e.dsl as Query;
  return fallback;
};

export type RunOptions = {
  context: Record<string, unknown>;
  scope?: ScopeValues;
  live: boolean;
  // Called for every pipeline event as it fires (live), so the UI can
  // advance the visualizer in real time rather than after the result.
  onEvent?: (event: VexEvent) => void;
};

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
    // ─── Analyzer demo: compile only, expect possible rejection ──
    if (scenario.mode === 'compile') {
      try {
        const compiled = runtime.engine.compile(scenario.dsl, opts.scope);
        return {
          ok: true,
          dsl: scenario.dsl,
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
          dsl: scenario.dsl,
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

    // ─── Execute path ───────────────────────────────────────────
    const request = { intent: scenario.intent, shape: scenario.shape, context: opts.context };
    const key = computeShapeHash(scenario.shape);

    let cacheHit = false;
    let generated = false;
    let live = false;

    try {
      if (opts.live) {
        // Force a genuine LLM generation + cache write.
        live = true;
        generated = true;
        const res = await runtime.engine.execute(request, { scope: opts.scope, cache: 'refresh' });
        return toOutcome(res, events, scenario, { cacheHit, generated, live });
      }

      // Canned: is the shape already warm with this exact DSL?
      const existing = await runtime.engine.cache.get(key);
      const warm = existing?.kind === 'ok' && deepEqual(existing.dsl, scenario.dsl);
      if (warm) {
        cacheHit = true;
      } else {
        // The DSL an agent would have produced — supplied directly so
        // the canned demo needs no key. This is the "generation" step.
        // Crucially we also seed a precomputed Prism IR (identity, or a
        // real nested reshape) so the engine maps rows WITHOUT calling
        // the LLM — keeping canned mode genuinely zero-cost.
        generated = true;
        const prismIr = await compile(scenario.mapping ?? IDENTITY_MAPPING);
        await runtime.engine.cache.set(key, {
          kind: 'ok',
          dsl: scenario.dsl,
          prismIr,
          schemaFingerprint: runtime.fingerprint,
          createdAt: Date.now(),
        });
      }
      const res = await runtime.engine.execute(request, { scope: opts.scope, cache: 'use' });
      return toOutcome(res, events, scenario, { cacheHit, generated, live });
    } catch (err) {
      console.error('[vex] run failed', err);
      return {
        ok: false,
        error: messageOf(err),
        dsl: dslFromEvents(events, scenario.dsl),
        rows: [],
        warnings: [],
        params: {},
        cacheHit,
        generated,
        live,
        cacheKey: key,
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
  // The mapping owns the output shape: an array (the scenarios here), or a
  // single object/scalar. The visualizer renders a row list, so wrap a
  // non-array result into one.
  rows: Array.isArray(res.result) ? res.result : [res.result],
  warnings: res.meta.warnings ?? [],
  params: res.meta.context as Record<string, ParamMeta>,
  missingContext: res.meta.missingContext,
  cacheHit: flags.cacheHit,
  generated: flags.generated,
  live: flags.live,
  cacheKey: res.meta.cache.key,
  timing: { ...res.meta.timing, totalMs: lastTotal(events) },
  events,
});

const lastTotal = (events: VexEvent[]): number | undefined => {
  for (const e of events) if (e.type === 'query.done') return e.totalMs;
  return undefined;
};

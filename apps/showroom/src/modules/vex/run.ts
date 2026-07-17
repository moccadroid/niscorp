import { handleQuery, lintMutation } from '@niscorp/vex';
import type { VexEvent, Query, ScopeValues } from '@niscorp/vex';
import { compile } from '@niscorp/prism';
import { deepEqual } from '@showroom/lib/deep-equal';
import type { VexRuntime } from './runtime/boot';
import { mutationPolicy } from './runtime/scope';
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
//  - 'execute' scenarios run the cached pipeline under a named
//    fingerprint per scenario. Canned (no key): if the slot isn't
//    already warm with this DSL we seed it (that's the "generation"
//    the LLM would do) and replay it — a HIT; re-runs reuse it.
//    Live: the slot is deleted first, so the request genuinely
//    regenerates through the LLM and re-fills the name.
// ═══════════════════════════════════════════════════════════

export type ParamMeta = { type: string; kind: 'context' | 'scope' | 'semantic' };

export type RunOutcome = {
  ok: boolean;
  error?: string;
  // The wire error code + status ('mutate' mode refusals — scope_denied,
  // missing_context, invalid_request), straight from the handler.
  errorCode?: string;
  status?: number;
  dsl?: Query; // absent on 'mutate' — a mutation definition is not a DSL
  sql?: string;
  rows: unknown[];
  warnings: string[];
  params: Record<string, ParamMeta>;
  missingContext?: string[];
  cacheHit: boolean; // logical: was this fingerprint already warm with this DSL?
  generated: boolean; // did this run (re)create the DSL?
  live: boolean; // did a real LLM generation run?
  fingerprint?: string;
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
const dslFromEvents = (events: VexEvent[], fallback?: Query): Query | undefined => {
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
    // ─── Mutate path — the write pipeline, through the REAL wire ──
    // The definition is seeded under the scenario's fingerprint (what an
    // app does at boot — linted, never generated), then the request goes
    // through handleQuery exactly as HTTP would deliver it: one wire
    // shape, { fingerprint, context }; the entry's kind picks the write
    // pipeline; refusals come back as genuine statuses.
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
            generated = true; // "seeded" — writes are never LLM-generated
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

    // ─── Read modes — execute/compile carry a DSL by construction ──
    const readDsl = scenario.dsl;
    if (readDsl === undefined) {
      return { ok: false, error: `scenario "${scenario.id}" has no DSL`, rows: [], warnings: [], params: {}, cacheHit: false, generated: false, live: false, timing: {}, events };
    }

    // ─── Analyzer demo: compile only, expect possible rejection ──
    if (scenario.mode === 'compile') {
      try {
        const compiled = runtime.engine.compile(readDsl, opts.scope);
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

    // ─── Execute path ───────────────────────────────────────────
    // Each scenario owns a named slot; canned runs replay it, live
    // runs regenerate it.
    const fingerprint = `vex-demo/${scenario.id}`;

    let cacheHit = false;
    let generated = false;
    let live = false;

    try {
      if (opts.live) {
        // Force a genuine LLM generation + cache write: clear the slot,
        // then send the full request under the same name — an unknown
        // fingerprint with intent + shape generates and fills it.
        live = true;
        generated = true;
        await runtime.engine.cache.delete(fingerprint);
        // A locked endpoint refuses ad-hoc generation: the deleted (unknown)
        // fingerprint + intent/shape under `locked` throws `locked`.
        const res = await runtime.engine.execute(
          { fingerprint, intent: scenario.intent, shape: scenario.shape, context: opts.context },
          { scope: opts.scope, ...(scenario.locked === true ? { locked: true } : {}) },
        );
        return toOutcome(res, events, scenario, { cacheHit, generated, live });
      }

      // Canned: is the slot already warm with this exact DSL?
      const existing = await runtime.engine.cache.get(fingerprint);
      const warm = existing?.kind === 'ok' && deepEqual(existing.dsl, readDsl);
      if (warm) {
        cacheHit = true;
      } else {
        // The DSL an agent would have produced — supplied directly so
        // the canned demo needs no key. This is the "generation" step.
        // Crucially we also seed a precomputed Prism IR (identity, or a
        // real nested reshape) so the engine maps rows WITHOUT calling
        // the LLM — keeping canned mode genuinely zero-cost. The stored
        // shape drives the array-vs-single envelope on replay.
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
      // Replay by fingerprint alone — the exact call an app would make.
      const res = await runtime.engine.execute(
        { fingerprint, context: opts.context },
        { scope: opts.scope },
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
  fingerprint: res.meta.cache.fingerprint,
  timing: { ...res.meta.timing, totalMs: lastTotal(events) },
  events,
});

const lastTotal = (events: VexEvent[]): number | undefined => {
  for (const e of events) if (e.type === 'query.done') return e.totalMs;
  return undefined;
};

import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import { queryRecord, queriesKnown } from '@lyceum/app/vex/query.entries';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { queryEngineFor } from '../querying';
import type { Querier, Known } from '../querying';
import { vexOver } from '../vex-over';

// A REQUEST IN WORDS, ROUTED TO A VEX QUERY. Vex is not something anybody
// talks to: a query is an INTENT and a SHAPE. The assistant, or the ask on a
// screen, hands over the intent; this decides the rest — two things that
// cannot be data (PLAN.md, "Vex is never hidden behind a function"): a model's
// CHOICE (has a stored query already answered this intent, and what shape is
// the answer — Jev) and a new query's GENERATION (vex's agents, which moss's
// locked endpoints refuse by design).
//
// It never answers. It returns the fingerprint the result replays by; the
// result the person sees is replayed through vex itself, as them
// (`query.result`) — the same way whether the query is a minute old or was
// written for somebody else. Everything that touches data does so as the
// caller, over their own wire, and is recorded as theirs. The run is theirs
// too: the trace the stage draws is expected here, in their session, before
// the engine runs (../generation).

const KnownSchema = z.array(z.object({ request: z.string(), fingerprint: z.string(), shape: z.string() }));
const MAX_INTENT = 200;

// WHY A QUERY WAS REFUSED, in words for the person who ran it — each kind of
// refusal saying what it is, because they are different things. The query
// writer found nothing in the records for it: its own reason, which is theirs
// to read (it was only ever shown the tables they may read). The engine
// refused what was written: it reached past their clearance — said as that,
// never naming what it reached for. Anything else went wrong, and goes to the
// log.
const VexCodeSchema = z.object({ code: z.string(), message: z.string() });
const refusalOf = (error: unknown): string => {
  const vex = VexCodeSchema.safeParse(error);
  if (vex.success && vex.data.code === 'unsatisfiable') return `No data answers that: ${vex.data.message}`;
  if (vex.success && vex.data.code === 'scope_denied') return 'Your permissions do not reach that data.';
  console.error('[lyceum] a query could not be written:', error);
  return 'The query could not be written.';
};

// What the route hands back: which query answers, in which shape, reached how.
// How that looks is the layouts' (app/actions/shared/answer.layouts.ts).
export type Routed = { fingerprint: string; kind: string; how: 'replayed' | 'generated' };

// ONE INTENT, ROUTED TO A QUERY — as the caller, recorded as theirs: an
// earlier intent's stored query, or a new one written under their policy, or
// refused, in words.
export const routeQuery = async (session: FunctionSession, querier: Querier, stated: string): Promise<Routed> => {
  const request = stated.trim().slice(0, MAX_INTENT);
  if (request === '') throw new Error('A query needs an intent.');
  const vex = vexOver(session.wire);
  const record = (shape: string, how: 'replayed' | 'generated' | 'refused', fingerprint: string | null): Promise<unknown> =>
    vex(queryRecord.fingerprint, { request, shape, how, fingerprint });

  const principal = session.principal ?? '';
  querier.trace.expect(request, principal);
  const known: Known[] = KnownSchema.parse(await vex(queriesKnown.fingerprint));
  const route = await querier.route(request, known);
  querier.trace.routed(principal, request, route.decided, known.length, QUERY_SHAPES.find((entry) => entry.kind === route.decided.shape)?.shape ?? null);

  // What the stage shows of the query that answered — a new one and a replayed
  // one alike: the document as it is stored, the statement that document
  // compiles to (its own limit, not a test's), and the caller's rows.
  const engine = await queryEngineFor(session.runtime, querier);
  const caller = { scope: { userId: session.principal }, scopePolicy: session.policy };
  const show = async (fingerprint: string, kind: string, rows: unknown): Promise<void> => {
    const stored = await session.runtime.cache?.get(fingerprint);
    if (stored?.kind !== 'ok') return;
    querier.trace.answered(principal, request, { document: stored.dsl, statement: engine.compile(stored.dsl).sql, rows, shape: QUERY_SHAPES.find((entry) => entry.kind === kind)?.shape ?? null });
  };

  if ('replay' in route) {
    await record(route.replay.shape, 'replayed', route.replay.fingerprint);
    querier.trace.replayed(request, principal, route.replay.fingerprint, route.replay.shape);
    const replayed = await engine.execute({ fingerprint: route.replay.fingerprint, context: {} }, caller);
    await show(route.replay.fingerprint, route.replay.shape, replayed.result);
    return { fingerprint: route.replay.fingerprint, kind: route.replay.shape, how: 'replayed' };
  }

  const shape = route.generate;
  try {
    const answered = await engine.execute({ intent: request, shape: shape.shape, context: {} }, caller);
    const fingerprint = answered.meta.cache.fingerprint;
    if (fingerprint === undefined) throw new Error('the query was answered but not stored');
    await record(shape.kind, 'generated', fingerprint);
    querier.trace.completed(request, fingerprint, shape.kind);
    await show(fingerprint, shape.kind, answered.result);
    return { fingerprint, kind: shape.kind, how: 'generated' };
  } catch (error) {
    // Refused — by the model (it cannot be answered from what this person
    // may read) or by the engine (what it wrote reaches past their policy).
    // Recorded, and said plainly.
    await record(shape.kind, 'refused', null);
    const why = refusalOf(error);
    querier.trace.refused(request, why);
    throw new Error(why);
  }
};

import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { queryRecord, queriesKnown } from '@lyceum/app/vex/query.entries';
import { queryEngineFor } from '../querying';
import type { Querier, Known } from '../querying';
import { vexOver } from '../vex-over';

// A VEX QUERY FROM WORDS. Anybody in the room types a request against the
// records. This is a function, not an endpoint, for the two things that cannot
// be data (PLAN.md, "Vex is never hidden behind a function"): a model's CHOICE —
// has this been run before, and what shape is the answer — and a new query's
// GENERATION, which moss's locked endpoints refuse by design.
//
// It never answers. It returns the fingerprint the result replays by, and the
// phone replays it through vex itself — as the caller, under their policy, the
// same way whether the query is a minute old or was written for somebody else.
// Everything that touches data does so as the caller, over their own wire.

const DraftSchema = z.object({ draft: z.string() });
const KnownSchema = z.array(z.object({ request: z.string(), fingerprint: z.string(), shape: z.string() }));
const MAX_REQUEST = 200;

// WHY A QUERY WAS REFUSED, in words for the person who ran it. The model's own
// reason is theirs to read — it was only ever shown the tables they may read.
// The engine's is not: it names what the query reached for, which is exactly
// what their clearance does not cover. That becomes a sentence; anything else
// goes to the log and is answered in general terms.
const VexCodeSchema = z.object({ code: z.string(), message: z.string() });
const refusalOf = (error: unknown): string => {
  const vex = VexCodeSchema.safeParse(error);
  if (vex.success && vex.data.code === 'unsatisfiable') return vex.data.message;
  if (vex.success && vex.data.code === 'scope_denied') return 'It reaches records your clearance does not cover.';
  console.error('[lyceum] a query could not be answered:', error);
  return 'Something went wrong writing the query.';
};

// What the route hands back: which query answers, in which shape, reached how.
// How that looks is the layouts' (app/actions/shared/answer.layouts.ts).
export type Routed = { fingerprint: string; kind: string; how: 'replayed' | 'generated' };

// ONE REQUEST, ROUTED TO A QUERY — as the caller, recorded as theirs: an
// earlier request's query, or a new one written under their policy, or
// refused, in words. Shared by the Query tab and the assistant's `query` tool,
// so a request is answered the same way whoever carries it.
export const routeQuery = async (session: FunctionSession, querier: Querier, typed: string): Promise<Routed> => {
  const request = typed.trim().slice(0, MAX_REQUEST);
  if (request === '') throw new Error('Type a request first.');
  const vex = vexOver(session.wire);
  const record = (shape: string, how: 'replayed' | 'generated' | 'refused', fingerprint: string | null): Promise<unknown> =>
    vex(queryRecord.fingerprint, { request, shape, how, fingerprint });

  const known: Known[] = KnownSchema.parse(await vex(queriesKnown.fingerprint));
  const route = await querier.route(request, known);

  if ('replay' in route) {
    await record(route.replay.shape, 'replayed', route.replay.fingerprint);
    return { fingerprint: route.replay.fingerprint, kind: route.replay.shape, how: 'replayed' };
  }

  const shape = route.generate;
  try {
    const engine = await queryEngineFor(session.runtime, querier);
    const answered = await engine.execute(
      { intent: request, shape: shape.shape, context: {} },
      { scope: { userId: session.principal }, scopePolicy: session.policy },
    );
    const fingerprint = answered.meta.cache.fingerprint;
    if (fingerprint === undefined) throw new Error('the query was answered but not stored');
    await record(shape.kind, 'generated', fingerprint);
    return { fingerprint, kind: shape.kind, how: 'generated' };
  } catch (error) {
    // Refused — by the model (it cannot be answered from what this person
    // may read) or by the engine (what it wrote reaches past their policy).
    // Recorded, and said plainly.
    await record(shape.kind, 'refused', null);
    throw new Error(`No query for that under your clearance. ${refusalOf(error)}`);
  }
};

export const queryFunctions = (session: FunctionSession, querier: Querier): Record<string, FunctionHandler> => ({
  'query.route': async (data) => routeQuery(session, querier, DraftSchema.parse(data).draft),
});

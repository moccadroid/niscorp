import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import { queryRecord, queriesKnown } from '@lyceum/app/vex/query.entries';
import { queryEngineFor } from '../querying';
import type { Querier, Known } from '../querying';
import { vexOver } from '../vex-over';

// THE ASSISTANT'S VEX QUERY. Vex is not something anybody talks to: a query is
// an INTENT and a SHAPE. The assistant hands over the intent; this decides the
// rest — two things that cannot be data (PLAN.md, "Vex is never hidden behind
// a function"): a model's CHOICE (has a stored query already answered this
// intent, and what shape is the answer — Jev) and a new query's GENERATION
// (vex's agents, which moss's locked endpoints refuse by design).
//
// It never answers. It returns the fingerprint the result replays by; the
// result the person sees is replayed through vex itself, as them
// (`query.result`) — the same way whether the query is a minute old or was
// written for somebody else. Everything that touches data does so as the
// caller, over their own wire, and is recorded as theirs.

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
    throw new Error(refusalOf(error));
  }
};

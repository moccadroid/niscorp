import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { QueryResponse } from '@niscorp/vex';
import { queryRecord, queriesKnown } from '@lyceum/app/vex/query.entries';
import { shapeOfKind } from '@lyceum/app/vex/query.shapes';
import type { QueryShape } from '@lyceum/app/vex/query.shapes';
import type { Querier, Known } from '../querying';
import { vexOver } from '../vex-over';

const KnownSchema = z.array(z.object({ request: z.string(), fingerprint: z.string(), shape: z.string() }));
const MAX_INTENT = 200;

// The query writer's own reason is theirs to read: it was only ever shown the
// tables they may read. A scope denial never names what it reached for.
const VexCodeSchema = z.object({ code: z.string(), message: z.string() });
const refusalOf = (error: unknown): string => {
  const vex = VexCodeSchema.safeParse(error);
  if (vex.success && vex.data.code === 'unsatisfiable') return `No data answers that: ${vex.data.message}`;
  if (vex.success && vex.data.code === 'scope_denied') return 'Your permissions do not reach that data.';
  console.error('[lyceum] a query could not be written:', error);
  return 'The query could not be written.';
};

export type Routed = { fingerprint: string; kind: string; how: 'replayed' | 'generated' };

export const routeQuery = async (session: FunctionSession, querier: Querier, stated: string, given?: QueryShape): Promise<Routed> => {
  const request = stated.trim().slice(0, MAX_INTENT);
  if (request === '') throw new Error('A query needs an intent.');
  const vex = vexOver(session.wire);
  const record = (shape: string, how: 'replayed' | 'generated' | 'refused', fingerprint: string | null): Promise<unknown> =>
    vex(queryRecord.fingerprint, { request, shape, how, fingerprint });

  const principal = session.principal ?? '';
  querier.trace.expect(request, principal);
  const known: Known[] = KnownSchema.parse(await vex(queriesKnown.fingerprint));
  const asked = Date.now();
  const route = await querier.route(request, known, given);
  querier.trace.routed(principal, request, route.decided, shapeOfKind(route.decided.shape)?.shape ?? null, Date.now() - asked);

  const show = (fingerprint: string, answered: QueryResponse): Promise<void> =>
    querier.trace.answered(principal, request, { fingerprint, rows: answered.result, engineMs: answered.meta.timing?.executionMs });

  if ('replay' in route) {
    await record(route.replay.shape, 'replayed', route.replay.fingerprint);
    querier.trace.replayed(request, principal, route.replay.fingerprint, route.replay.shape);
    await show(route.replay.fingerprint, await session.answerIntent(querier, { fingerprint: route.replay.fingerprint }));
    return { fingerprint: route.replay.fingerprint, kind: route.replay.shape, how: 'replayed' };
  }

  const shape = route.generate;
  try {
    // Inside `during`, so what the writers record is this request's.
    const answered = await querier.trace.during(request, () => session.answerIntent(querier, { intent: request, shape: shape.shape }));
    const fingerprint = answered.meta.cache.fingerprint;
    if (fingerprint === undefined) throw new Error('the query was answered but not stored');
    await record(shape.kind, 'generated', fingerprint);
    querier.trace.completed(request, fingerprint, shape.kind);
    await show(fingerprint, answered);
    return { fingerprint, kind: shape.kind, how: 'generated' };
  } catch (error) {
    await record(shape.kind, 'refused', null);
    const why = refusalOf(error);
    querier.trace.refused(request, why);
    throw new Error(why);
  }
};

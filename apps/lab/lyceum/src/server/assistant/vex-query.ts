import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import { queryRecord, queriesKnown } from '@lyceum/app/vex/query.entries';
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
    const answered = await session.answerIntent(querier, { intent: request, shape: shape.shape });
    const fingerprint = answered.meta.cache.fingerprint;
    if (fingerprint === undefined) throw new Error('the query was answered but not stored');
    await record(shape.kind, 'generated', fingerprint);
    return { fingerprint, kind: shape.kind, how: 'generated' };
  } catch (error) {
    await record(shape.kind, 'refused', null);
    throw new Error(refusalOf(error));
  }
};

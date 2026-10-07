import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { routeQuery } from '../assistant/vex-query';
import type { Querier } from '../querying';

// THE ASK — a question about the room, in words, from a screen rather than
// through the assistant (app/actions/ask/). It is the one route a request in
// words takes (../assistant/vex-query.ts): as the caller, recorded as theirs,
// and what comes back is the query to replay, which the screen opens as the
// person (`query.result`). The function answers nothing itself.
const AskSchema = z.object({ intent: z.string().trim().min(1, 'Type a question first.') });

export const queryFunctions = (session: FunctionSession, querier: Querier): Record<string, FunctionHandler> => ({
  'query.ask': async (input) => {
    const { intent } = AskSchema.parse(input);
    const routed = await routeQuery(session, querier, intent);
    const shape = QUERY_SHAPES.find((entry) => entry.kind === routed.kind)?.shape ?? null;
    return { intent, shape: JSON.stringify(shape), routed };
  },
});

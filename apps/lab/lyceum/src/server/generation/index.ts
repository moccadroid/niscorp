import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { EMPTY_TRACE } from './trace';
import type { Tracer } from './trace';

// WATCHING A QUERY BEING WRITTEN — the module. The trace (./trace.ts) is the
// record; the watched writer (./writer.ts) fills it; the stage reads the
// speaker's newest one through `room.generation`, told that it changed by a
// channel with no payload — the same way the speaker's assistant is mirrored
// (../mirroring.ts). The stage only looks.
export { createTracer, EMPTY_TRACE, foldStatement, lookCall, summary, testCall } from './trace';
export type { Call, Outcome, Pane, Trace, Tracer } from './trace';
export { watchedShapeMapper } from './mapper';
export { watchedQueryDsl } from './writer';

// Delivered to the stage's shell whenever a trace changes; the writer slide
// hears it and reads again (app/actions/slide/vex.actions.ts says the same name).
export const GENERATION_CHANNEL = 'generation-changed';

export const generationFunctions = (session: FunctionSession, tracer: Tracer): Record<string, FunctionHandler> => ({
  // The speaker's newest generation, for the stage to draw — and for the
  // speaker, who may look at their own.
  'room.generation': async () => {
    if (session.principal !== 'stage' && session.principal !== 'speaker') throw new Error('Only the stage watches the speaker’s query being written.');
    return tracer.latest('speaker') ?? EMPTY_TRACE;
  },
});

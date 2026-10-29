import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import { EMPTY_TRACE } from './trace';
import type { Tracer } from './trace';

export { createTracer, EMPTY_TRACE, foldStatement, lookCall, summary, testCall } from './trace';
export type { Call, Outcome, Pipeline, Step, Trace, Tracer } from './trace';
export { standInShapeMapper, watchedShapeMapper } from './mapper';
export { watchedQueryDsl } from './writer';

// Delivered to the stage's shell whenever a trace changes; the writer slide
// hears it and reads again (app/actions/slide/vex.actions.ts says the same name).
export const GENERATION_CHANNEL = 'generation-changed';

export const generationFunctions = (session: FunctionSession, tracer: Tracer): FunctionDefinition[] => [
  {
    id: 'room.generation',
    description: 'Answers the speaker’s newest query request as it was answered: routed, written, mapped, stored or refused. The stage and the speaker only. Send nothing.',
    execute: async () => {
      if (session.principal !== 'stage' && session.principal !== 'speaker') throw new Error('Only the stage watches the speaker’s query being written.');
      return tracer.latest('speaker') ?? EMPTY_TRACE;
    },
  },
];

import { AsyncLocalStorage } from 'node:async_hooks';
import type { AnswerData } from './contract';

// cortex hands an output validator the envelope and nothing else, so the module-scope agent's
// validator reads its own run's facts from the scope the run is started in.

export type RunFacts = {
  refusals: (data: AnswerData, response: string) => string[];
};

export const runFacts = new AsyncLocalStorage<RunFacts>();

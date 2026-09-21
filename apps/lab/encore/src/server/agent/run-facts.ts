import { AsyncLocalStorage } from 'node:async_hooks';
import type { AnswerData } from './contract';

// WHAT ONLY THIS RUN KNOWS, reachable from a validator that is handed nothing.
//
// The agent is defined once, at module scope, and its `output.validate` is part
// of that definition — but what an answer may name is per RUN: the six actions
// Jev ranked highest for this sentence, the candidate rows of this pass, the
// fields that are writable on this screen. cortex hands a validator the
// envelope and nothing else (`OutputValidator`, packages/cortex/src/loop/
// loop.ts:72-74 — no deps, no run context), so a module-scope agent cannot
// check an answer against its own run.
//
// This is the smallest honest way round it, and it is listed as a gap in
// PLAN.md: the run is started inside an AsyncLocalStorage scope, and the
// validator reads the scope it is running in. Node carries the store across
// every await cortex makes, so a validator called five steps into a run finds
// the facts of THAT run — two sessions running at once cannot see each other's.
//
// The alternative — rebuilding the agent per run to close over the facts — is
// the pattern cortex's typed deps exist to delete. The fix that belongs in
// cortex is one argument: hand the validator `deps`.

export type RunFacts = {
  // The admission rule (intent/admission.ts), bound to this run's narrowed
  // actions, candidate rows and writable fields. Empty = admitted.
  refusals: (data: AnswerData) => string[];
};

export const runFacts = new AsyncLocalStorage<RunFacts>();

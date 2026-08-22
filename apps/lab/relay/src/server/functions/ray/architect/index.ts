// The action architect — one free agent on a complete, producer-composed
// knowledge base (architect.agent.ts), judged by the HARNESS (harness.ts:
// schema parse → static audit → mount → load report) and reviewed by the
// validator (validator.agent.ts: a pure reader pairing the intent's claims
// with the definition's actual wiring). run.ts composes them: build →
// harness → review → at most one repair — plain code between free agents.
// The only outside touches are Ray importing `makeBuildActionTool` and the
// bench driving `runActionArchitect`.
export { makeBuildActionTool, runActionArchitect, architectLlms, queryIntentsOf, type BuildLlms, type BuildResult, type BuildOptions } from './run';
export { makeArchitectAgent, type ActionAgentOutput } from './architect.agent';
export { validatorAgent, type ValidatorVerdict } from './validator.agent';
export { componentPalette, actionCatalog, editingGuide } from './producers';
export { makeArchitectTools, type ArchitectTools } from './tools';
export { runAction, type RunResult } from './harness';

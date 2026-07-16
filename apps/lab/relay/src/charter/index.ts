// The charter module. types/glob/resolve/verify are the engine — universe-
// blind, zero relay-specific imports, written to lift out as the policy
// package (SERVER.md staging step 2). policy.ts is the vex compiler (the one
// place charter imports a target's type). charter.ts and assignments.ts are
// relay's artifacts: the documents the engine resolves.
export type { Charter, RoleDef, Selection, Section } from './types';
export { matchGlob, matchAll } from './glob';
export { CharterError, resolveRole, resolvePrincipal, normalizeRole, dataUniverse, DATA_VERBS } from './resolve';
export { verifyCharter, type VerifyReport, type VerifyIssue, type RoleClosure } from './verify';
export { policyFor, type ScopeBehaviors } from './policy';
export { CHARTER } from './charter';
export { ASSIGNMENTS, rolesOf } from './assignments';

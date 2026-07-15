// The charter module. types/glob/resolve/verify are the engine — zero
// relay-specific imports, written to lift out as the policy-engine package
// (SERVER.md staging step 2). charter.ts and assignments.ts are relay's
// artifacts: the documents the engine resolves.
export type { Charter, RoleDef } from './types';
export { matchGlob, matchAll } from './glob';
export { CharterError, resolveRole, resolvePrincipal, normalizeRole } from './resolve';
export { verifyCharter, type VerifyReport, type VerifyIssue, type RoleClosure } from './verify';
export { CHARTER } from './charter';
export { ASSIGNMENTS, rolesOf } from './assignments';

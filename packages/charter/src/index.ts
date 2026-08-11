// @niscorp/charter — a universe-blind policy engine, and nothing else.
//
// A charter maps role names to glob selections over OPAQUE STRING universes
// (one per section); the engine resolves them and the verifier refuses
// incoherence. It has zero dependencies BY DESIGN: it never knows what a
// string means, never manufactures a universe (each governed target exports
// its own dialect — nova action ids, vex verb leaves — and the composer
// hands the universe in), and the per-role closure audit is an injected
// hook. The documents it resolves (the charter itself, assignments) are the
// APP's artifacts, not this package's.
export type { Charter, RoleDef, Selection, Section } from './types';
export { matchGlob, matchAll } from './glob';
export { CharterError, resolveRole, resolvePrincipal, resolveScoping, normalizeRole } from './resolve';
export { verifyCharter, type VerifyReport, type VerifyIssue, type RoleClosure, type ClosureAuditor } from './verify';

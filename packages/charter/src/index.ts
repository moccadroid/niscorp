export type { Charter, RoleDef, Selection, Section } from './types';
export { matchGlob, matchAll } from './glob';
export { CharterError, resolveRole, resolvePrincipal, resolveScoping, normalizeRole } from './resolve';
export { verifyCharter, type VerifyReport, type VerifyIssue, type RoleClosure, type ClosureAuditor } from './verify';

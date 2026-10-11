// ═══════════════════════════════════════════════════════════════
// Identity — who is calling.
//
// The first question moss asks of a request, and the one every other answer
// is built on: what exists for somebody, what they may read and write and what
// they are looking at all start from who they are. It is answered in two
// steps, and both live here.
//
// A TOKEN IS A PRINCIPAL. The deployment says how (`runtime.session`,
// ./verifier.ts): moss's own stored credential (./sessions.ts), the dev pair
// (./dev-token.ts), or a function of the app's. A browser carries its token in
// a cookie its page cannot read (./session-cookie.ts), and a sign-in made over
// the socket reaches that cookie sealed (./seal.ts).
//
// A PRINCIPAL IS A RECORD (./record.ts): roles, scope values, the integrations
// live for them. The app says which, and the answer is held, bounded, for as
// long as a session's credential is trusted (./cache.ts). `createIdentity`
// (./resolution.ts) is the one object the server builds for all of it. What
// is worked out for somebody is kept by what it depends on, their roles and
// what is installed for them, and never by who they are (./memo-key.ts).
//
// This module imports `runtime` and `protocol`, and nothing else of moss.
// ═══════════════════════════════════════════════════════════════

export type { IdentityReport } from './cache';
export { mintDevToken } from './dev-token';
export { memoKey } from './memo-key';
export type { IdentityRecord } from './record';
export { assignedRoles, createIdentity } from './resolution';
export type { Identity, ResolvedIdentity } from './resolution';
export { newSeal, openSealed, sealCookie, sealOf, sealSession } from './seal';
export { ownOriginOf, sessionCookies, sessionTokenOf } from './session-cookie';
export { SESSIONS_SEQUENCE, SESSION_TOKEN_PREFIX, mintSession, revokeAllFor, sessionRemainingMs } from './sessions';
export { sessionRevokerOf, sessionVerifierOf } from './verifier';

import { mintDevToken } from '@niscorp/moss';

// Our own principal, and the one the tool's charter assigns the operator role.
// It is not in atrium's cast and atrium's directory has never heard of it: a
// token minted here does not resolve to a person in any hotel, and a token
// minted there resolves to nobody in this charter. The two identity spaces do
// not overlap, which is the strongest form the boundary can take.
//
// Dev-grade bearer tokens, the lab's stated posture (PLAN.md). Real auth
// replaces the mint on both sides together and nothing else moves.
export const ADMIN_PRINCIPAL = 'op_atrium';

export const adminToken = (): string => mintDevToken(ADMIN_PRINCIPAL);

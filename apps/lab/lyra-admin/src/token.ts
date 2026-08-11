import { mintDevToken } from '@niscorp/moss';

// Our own principal, and the one this tool's charter assigns the operator role.
// It is not in Lyra's cast and Lyra's directory has never heard of it: a token
// minted here resolves to nobody in any studio, and a token minted there
// resolves to nobody in this charter. The two identity spaces do not overlap,
// which is the strongest form the boundary can take.
//
// Dev-grade bearer tokens, the lab's stated posture. Real auth replaces the
// mint on both sides together and nothing else moves.
export const ADMIN_PRINCIPAL = 'op_lyra';

export const adminToken = (): string => mintDevToken(ADMIN_PRINCIPAL);

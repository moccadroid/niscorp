import { mintDevToken } from '@niscorp/moss';

export const ADMIN_PRINCIPAL = 'op_lyra';

export const adminToken = (): string => mintDevToken(ADMIN_PRINCIPAL);

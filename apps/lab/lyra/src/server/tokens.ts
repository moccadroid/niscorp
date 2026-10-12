import { mintDevToken } from '@niscorp/moss';
import type { ExecuteAs } from '@niscorp/moss';
import { principalByEmail } from './links';

export const mintToken = async (runAs: ExecuteAs, email: string): Promise<string | null> => {
  const principal = await principalByEmail(runAs, email);
  return principal === null ? null : mintDevToken(principal);
};

import { mintDevToken } from '@niscorp/moss';
import type { ExecuteAs } from '@niscorp/moss';
import { principalByEmail } from './links';

// THE DEV CREDENTIAL, minted for whoever an address resolves to.
//
// `runtime.session` is where real authentication replaces this — moss says so
// itself, and the sign-in link path in `boot.ts` is what a deployment uses. This
// exists because the lab needs a token without a mailbox, and because every
// check addresses people by the address they would sign in with.
export const mintToken = async (runAs: ExecuteAs, email: string): Promise<string | null> => {
  const principal = await principalByEmail(runAs, email);
  return principal === null ? null : mintDevToken(principal);
};

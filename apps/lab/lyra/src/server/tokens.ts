import { mintDevToken } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { principalByEmail } from './lookup';

// THE DEV CREDENTIAL, minted for whoever an address resolves to.
//
// `runtime.session` is where real authentication replaces this — moss says so
// itself, and the sign-in link path in `boot.ts` is what a deployment uses. This
// exists because the lab needs a token without a mailbox, and because every
// check addresses people by the address they would sign in with.
export const mintToken = async (pool: PgPool, email: string): Promise<string | null> => {
  const principal = await principalByEmail(pool, email);
  return principal === null ? null : mintDevToken(principal);
};

// The shell the dev checks drive — signed in through the REAL auth path
// (mint + store a token) and built through the REAL charter filter. alex
// (sales + dev) is the default; `shellAs('sam')` gives the admin surface
// (router-check needs settings).
import type { Shell } from '@niscorp/nova';
import { buildShell } from '../nova/shell';
import { identity, signIn, mintToken } from '../auth';

export const shellAs = (username: string): Shell => {
  const token = mintToken(username);
  if (token === null) throw new Error(`check-shell: unknown username "${username}"`);
  signIn(token);
  return buildShell(identity());
};

export const shell = shellAs('alex');

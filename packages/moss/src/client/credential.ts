import { offerToken } from '../protocol';
import type { WireTokenStore } from './env';

export type Credential = {
  signedIn: () => boolean;
  params: () => string[];
  offered: () => string[];
  answered: () => void;
  become: (token: string | null, sealed: string | null) => void;
  leave: (leaving: boolean) => void;
  sealNotKept: () => void;
};

export const createCredential = (tokens: WireTokenStore): Credential => {
  let token = tokens.load();
  let leaving = false;
  let sealed: string | null = null;
  let unsealed = false;
  return {
    signedIn: () => token !== null || tokens.held?.() === true,
    params: () => [
      ...(tokens.key !== undefined ? [`key=${encodeURIComponent(tokens.key)}`] : []),
      ...(leaving ? ['leave=1'] : []),
      ...(tokens.held !== undefined && !unsealed ? ['sealed=1'] : []),
    ],
    offered: () => offerToken(token, sealed),
    // A browser that keeps the session itself holds it once the upgrade is answered, and the token
    // is let go of. One that does not (another origin, cookies refused) has it stored.
    answered: () => {
      leaving = false;
      sealed = null;
      if (token === null || tokens.held === undefined) return;
      if (tokens.held()) {
        tokens.clear();
        token = null;
      } else tokens.save(token);
    },
    become: (next, handedSealed) => {
      sealed = handedSealed;
      if (handedSealed !== null) {
        // Sealed: nothing this page can read, so nothing is stored.
      } else if (next === null) tokens.clear();
      else if (tokens.held === undefined) tokens.save(next);
      token = next;
    },
    leave: (next) => {
      leaving = next;
    },
    sealNotKept: () => {
      unsealed = true;
    },
  };
};

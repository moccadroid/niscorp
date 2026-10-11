import { offerToken } from '../protocol';
import type { WireTokenStore } from './env';

// Who this terminal is, between connects: the token it holds, a sign-in it was
// handed sealed, and whether it is leaving. Each upgrade offers what is held
// here; what becomes of it is settled when the upgrade is answered.

export type Credential = {
  // signed in: holding a token, or its browser a session
  signedIn: () => boolean;
  // what the socket's address says of it — never the token (an address is what
  // every proxy on the way writes down)
  params: () => string[];
  // the subprotocols the socket is constructed offering (../protocol)
  offered: () => string[];
  // The upgrade has been answered, so a browser that keeps the session itself
  // now does: the token this terminal offered is let go of, and the page holds
  // it no longer. One that does not (another origin, cookies refused) leaves
  // it with the terminal, stored.
  answered: () => void;
  // A different principal, possibly none: as a token, or as a sign-in handed
  // over SEALED, which is nothing this page can read and is carried to the
  // next upgrade as it is. A host whose browser may keep the session stores
  // nothing yet: the token is offered, and what becomes of it is settled when
  // the upgrade is answered (`answered`).
  become: (token: string | null, sealed: string | null) => void;
  // Signed out, and not yet heard by the server: the next upgrade says so,
  // because what the browser holds may be a token that still resolves.
  leave: (leaving: boolean) => void;
  // This browser turned out not to keep the cookie that opens a sealed
  // sign-in, so the terminal stops asking to be handed one.
  sealNotKept: () => void;
};

export const createCredential = (tokens: WireTokenStore): Credential => {
  let token = tokens.load();
  let leaving = false;
  // A sign-in handed to this terminal SEALED: its browser keeps the session,
  // so the page is given something it can carry to the next upgrade and cannot
  // open. Offered until an upgrade is answered.
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
      // whatever was being offered sealed is over: taken, or refused
      sealed = handedSealed;
      if (handedSealed !== null) {
        /* nothing this page can read, so nothing to store */
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

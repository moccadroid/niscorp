// How a connection is opened and how it ends: the protocol number a terminal
// names on the upgrade, what it offers there to say who it is, and the close
// codes it is answered with.

// The wire protocol this server speaks, and the oldest a terminal may speak to
// it. A terminal says which it speaks on the upgrade (`?protocol=N` — known
// before the first frame is sent); one that says nothing speaks 1, which is
// every terminal built before the question existed. Outside the range the
// connection is refused with a sentence and CLOSE_PROTOCOL_MISMATCH, never
// served frames it would misread. Bump PROTOCOL when a message changes shape;
// raise PROTOCOL_MIN only when the server stops speaking an old one.
//
// 2: the token left the address. A terminal at 1 put it in `?token=`, and an
// address is what every proxy on the way writes into its log. A server that
// went on reading it there would keep that open for as long as anything used
// it, so 1 is no longer spoken: a terminal built before is told to reload.
export const PROTOCOL = 2;
export const PROTOCOL_MIN = 2;

// WHO A TERMINAL IS rides the upgrade request, in the one header every host
// lets a terminal set, a browser included: the subprotocols it offers. It
// offers `nisc`, and beside it its token when it holds one — base64url,
// because a subprotocol is an HTTP token and a session token need not be. The
// server answers `nisc`, never the other. Decided on the request, so no
// connection is ever open and waiting to be told who it is.
export const SUBPROTOCOL = 'nisc';
const TOKEN_OFFER = 'nisc.token.';
const SEALED_OFFER = 'nisc.sealed.';

// `sealed`: a sign-in the terminal was handed sealed, offered back as it is.
export const offerToken = (token: string | null, sealed: string | null = null): string[] => {
  const offer = sealed === null ? [SUBPROTOCOL] : [SUBPROTOCOL, `${SEALED_OFFER}${sealed}`];
  if (token === null) return offer;
  const bytes = String.fromCharCode(...new TextEncoder().encode(token));
  return [...offer, `${TOKEN_OFFER}${btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`];
};

export const offeredToken = (offered: readonly string[] = []): string | null => {
  const offer = offered.find((entry) => entry.startsWith(TOKEN_OFFER));
  if (offer === undefined) return null;
  try {
    const bytes = atob(offer.slice(TOKEN_OFFER.length).replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes, (char) => char.charCodeAt(0))) || null;
  } catch {
    return null;
  }
};

// The sealed sign-in a terminal offered back, still sealed: only the seal its
// browser holds opens it.
export const offeredSealed = (offered: readonly string[] = []): string | null => offered.find((entry) => entry.startsWith(SEALED_OFFER))?.slice(SEALED_OFFER.length) ?? null;

// Application close code: the token did not resolve to a principal.
export const CLOSE_INVALID_TOKEN = 4401;
// Application close code: the session ended (sign-out, from any of the
// principal's terminals) — the terminal clears its token instead of
// reconnecting.
export const CLOSE_SIGNED_OUT = 4403;
// Application close code: the server could not open a session for THIS
// connection — commonest cause: a definition failing validation reached the
// live catalog (a dev edit mid-reload). The refusal is this terminal's alone;
// the process and every other session stay up, and reconnecting later is
// reasonable — the next build is attempted fresh.
export const CLOSE_SHELL_FAILED = 4500;
// Application close code: terminal and server speak protocols the other cannot
// (see PROTOCOL). Not a retry: reconnecting speaks the same protocol again. A
// browser terminal needs a reload to fetch the current build; the preceding
// `error` says which side is behind (`client_too_old` / `server_too_old`).
export const CLOSE_PROTOCOL_MISMATCH = 4426;

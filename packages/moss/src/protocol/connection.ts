// PROTOCOL moves when a message changes shape; PROTOCOL_MIN when the server stops speaking an old one.
export const PROTOCOL = 2;
export const PROTOCOL_MIN = 2;

// A terminal says who it is in the subprotocols it offers, the one header a browser lets it set
// on an upgrade, and never in the address, which every proxy on the way logs. The token is
// base64url because a subprotocol is an HTTP token and a session token need not be.
export const SUBPROTOCOL = 'nisc';
const TOKEN_OFFER = 'nisc.token.';
const SEALED_OFFER = 'nisc.sealed.';

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

export const offeredSealed = (offered: readonly string[] = []): string | null => offered.find((entry) => entry.startsWith(SEALED_OFFER))?.slice(SEALED_OFFER.length) ?? null;

export const CLOSE_INVALID_TOKEN = 4401;
export const CLOSE_SIGNED_OUT = 4403;
export const CLOSE_SHELL_FAILED = 4500;
export const CLOSE_AT_CAPACITY = 4503;
export const CLOSE_PROTOCOL_MISMATCH = 4426;

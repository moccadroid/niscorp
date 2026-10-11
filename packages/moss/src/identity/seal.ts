import { z } from 'zod';
import { tokenFromCookie } from './session-cookie';

// ═══════════════════════════════════════════════════════════════
// THE SEAL — how a sign-in made over the socket reaches the session cookie
// (./session-cookie.ts).
//
// Only an HTTP answer can write a cookie, and a sign-in over the socket is not
// one: the token has to travel through the page to the next upgrade. It
// travels SEALED — encrypted with a key the page's browser holds in a second
// cookie no script can read, set by the answer to its first upgrade. The page
// can hand it back and cannot open it; neither can anybody it is shown to, on
// this machine or another. It is good for a minute.
//
// The seal rides only the socket's own path: no page request carries it, so a
// page drawn for nobody is still the same for everybody. It lasts until the
// browser closes, and is never stored or looked up here — a key, not a name.
//
// ITS NAME IS WHAT KEEPS A SCRIPT FROM SUPPLYING IT. A request shows a cookie's
// name and value and nothing of who set it, so a seal a script planted before
// the browser's first upgrade would look like one given here — and the script
// would hold the key. Over https the seal is `__Http-` prefixed: a name a
// browser lets only an HTTP answer set, never script. A browser that does not
// know the prefix treats it as any other name, and is where that is still open.
//
// WebCrypto, so this is the same on every runtime and nothing here is Node's.
// ═══════════════════════════════════════════════════════════════

const SEALED_FOR_MS = 60_000;
// What is inside a sealed sign-in once it is opened: the token, and until when
// it may be used.
const SealedSchema = z.object({ token: z.string(), until: z.number() });
const sealName = (secure: boolean): string => `${secure ? '__Http-' : ''}nisc.seal`;
const toBase64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
const keyOf = async (seal: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seal)), 'AES-GCM', false, ['encrypt', 'decrypt']);

export const newSeal = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

// The seal a browser sent with an upgrade, and the `Set-Cookie` value that
// gives it one: for the socket's own `path` only, unreadable to script.
export const sealOf = (cookies: string | null | undefined, secure: boolean): string | null => tokenFromCookie(cookies, sealName(secure));
export const sealCookie = (seal: string, where: { secure: boolean; path: string }): string =>
  `${sealName(where.secure)}=${seal}; HttpOnly; Path=${where.path}; SameSite=Lax${where.secure ? '; Secure' : ''}`;

export const sealSession = async (seal: string, token: string, forMs = SEALED_FOR_MS): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(seal), new TextEncoder().encode(JSON.stringify({ token, until: Date.now() + forMs })));
  return toBase64Url(new Uint8Array([...iv, ...new Uint8Array(sealed)]));
};

// The token in a sealed sign-in — or null: not sealed with this seal, altered, or too old.
export const openSealed = async (seal: string, sealed: string): Promise<string | null> => {
  try {
    const bytes = fromBase64Url(sealed);
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await keyOf(seal), bytes.slice(12));
    const inside = SealedSchema.safeParse(JSON.parse(new TextDecoder().decode(opened)));
    return inside.success && inside.data.until > Date.now() ? inside.data.token : null;
  } catch {
    return null;
  }
};

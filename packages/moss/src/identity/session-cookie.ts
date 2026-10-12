import { z } from 'zod';
import { DEFAULT_TOKEN_KEY, sessionNameOf } from '../protocol';

export const tokenFromCookie = (header: string | null | undefined, name = DEFAULT_TOKEN_KEY): string | null => {
  if (header === undefined || header === null) return null;
  const wanted = encodeURIComponent(name);
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== wanted) continue;
    try {
      const value = decodeURIComponent(part.slice(at + 1).trim());
      return value === '' ? null : value;
    } catch {
      return null;
    }
  }
  return null;
};

export const ownOriginOf = (origin: string | null | undefined, host: string | null | undefined, listed: readonly string[] = []): URL | undefined => {
  if (origin === undefined || origin === null || !URL.canParse(origin)) return undefined;
  const asked = new URL(origin);
  const own = asked.host === host?.toLowerCase() || listed.some((entry) => URL.canParse(entry) && new URL(entry).origin === asked.origin);
  return own ? asked : undefined;
};

const cookiesAt = (where: { port: string; secure: boolean }, key: string, token: string | null, lastsMs?: number | null): string[] => {
  const name = encodeURIComponent(sessionNameOf(key, where.port));
  const life = token === null ? '; Max-Age=0' : typeof lastsMs === 'number' ? `; Max-Age=${Math.max(0, Math.floor(lastsMs / 1000))}` : '';
  const kept = `Path=/; SameSite=Lax${where.secure ? '; Secure' : ''}${life}`;
  // The second cookie is readable by script and says only that the browser holds a session.
  return [`${where.secure ? '__Host-' : ''}${name}=${encodeURIComponent(token ?? '')}; HttpOnly; ${kept}`, `${name}.held=${token === null ? '' : '1'}; ${kept}`];
};

const originOf = (request: Request): string => {
  const said = request.headers.get('origin');
  if (said !== null && URL.canParse(said)) return said;
  const here = new URL(request.url);
  const scheme = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || here.protocol.slice(0, -1);
  return `${scheme}://${request.headers.get('host') ?? here.host}`;
};

export const sessionCookies = (page: string | Request, token: string | null, options: { key?: string; lastsMs?: number | null } = {}): string[] => {
  const at = new URL(typeof page === 'string' ? page : originOf(page));
  return cookiesAt({ port: at.port, secure: at.protocol === 'https:' }, options.key ?? DEFAULT_TOKEN_KEY, token, options.lastsMs);
};

export const sessionTokenOf = (
  cookies: string | null | undefined,
  where: { port: string; secure?: boolean },
  key = DEFAULT_TOKEN_KEY,
): { token: string; clear: string[] } | null => {
  const name = sessionNameOf(key, where.port);
  // Where `secure` is unknown, the `__Host-` name is read first: only this
  // host can have set that one.
  for (const secure of where.secure === undefined ? [true, false] : [where.secure]) {
    const token = tokenFromCookie(cookies, `${secure ? '__Host-' : ''}${name}`);
    if (token !== null) return { token, clear: cookiesAt({ port: where.port, secure }, key, null) };
  }
  return null;
};

// A sign-in made over the socket cannot write a cookie, so its token travels
// through the page to the next upgrade encrypted with a key, the seal, that
// the browser holds in a cookie no script can read: the page can hand the
// token back and cannot open it.
const SEALED_FOR_MS = 60_000;
const SealedSchema = z.object({ token: z.string(), until: z.number() });
// Over https the name is `__Http-` prefixed, which a browser lets only an HTTP
// answer set: a script cannot plant a seal it holds the key of.
const sealName = (secure: boolean): string => `${secure ? '__Http-' : ''}nisc.seal`;
const toBase64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
const keyOf = async (seal: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seal)), 'AES-GCM', false, ['encrypt', 'decrypt']);

export const newSeal = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export const sealOf = (cookies: string | null | undefined, secure: boolean): string | null => tokenFromCookie(cookies, sealName(secure));
export const sealCookie = (seal: string, where: { secure: boolean; path: string }): string =>
  `${sealName(where.secure)}=${seal}; HttpOnly; Path=${where.path}; SameSite=Lax${where.secure ? '; Secure' : ''}`;

export const sealSession = async (seal: string, token: string, forMs = SEALED_FOR_MS): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(seal), new TextEncoder().encode(JSON.stringify({ token, until: Date.now() + forMs })));
  return toBase64Url(new Uint8Array([...iv, ...new Uint8Array(sealed)]));
};

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

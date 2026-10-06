// ═══════════════════════════════════════════════════════════════
// A BROWSER'S SESSION, KEPT WHERE ITS PAGE CANNOT READ IT.
//
// A terminal served by the app it talks to does not hold its session: the
// browser does, in a cookie no script can read, and sends it by itself with
// the two requests that need to know who is asking — the page, and the
// upgrade that opens the socket. The server writes it in its answer to that
// upgrade (socket.ts), or to a sign-in the app answers over HTTP
// (`sessionCookies`, below). Any other terminal — a process, a page served
// from somewhere else — holds its own token and offers it, as before.
//
// THE NAME is the terminal's token key (`nisc.token`, or a seat's own), so
// several people can be signed in on one origin, each in a seat. It ends with
// the port when the page is on one: a browser keeps cookies by host and not by
// port, and two apps on localhost would otherwise sign each other out. Over
// https it is `__Host-` prefixed and `Secure`, which a browser lets nothing
// but this host set.
//
// BESIDE IT, `<name>.held=1`, which script CAN read and which says nothing but
// that the browser holds a session — how a terminal knows to let go of a token
// it was holding, and that a page drawn for somebody was drawn for it.
//
// NO ROUTE ANSWERS TO THIS COOKIE. It is read for a page request, which every
// site may link to and none can read the answer of, and on an upgrade from the
// app's own page — never from another origin's, which a browser would send it
// with all the same.
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_TOKEN_KEY = 'nisc.token';

// The token under one name in a `Cookie` header.
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

// Is this the app's own page asking? Its origin's host is the host the request
// was addressed to — or one the deployment lists, behind a proxy that rewrites
// `Host`. A sibling subdomain, another port, an opaque origin: not it.
export const isOwnOrigin = (origin: string | null | undefined, host: string | null | undefined, listed: readonly string[] = []): origin is string => {
  if (origin === undefined || origin === null || !URL.canParse(origin)) return false;
  const asked = new URL(origin);
  return asked.host === host?.toLowerCase() || listed.some((entry) => URL.canParse(entry) && new URL(entry).origin === asked.origin);
};

const nameOf = (key: string, port: string): string => `${key}${port === '' ? '' : `.${port}`}`;

// The flag's name, as a terminal on `port` reads it out of `document.cookie`.
export const heldCookieName = (key = DEFAULT_TOKEN_KEY, port = ''): string => encodeURIComponent(`${nameOf(key, port)}.held`);

const cookiesAt = (where: { port: string; secure: boolean }, key: string, token: string | null, lastsMs?: number | null): string[] => {
  const name = encodeURIComponent(nameOf(key, where.port));
  const life = token === null ? '; Max-Age=0' : typeof lastsMs === 'number' ? `; Max-Age=${Math.max(0, Math.floor(lastsMs / 1000))}` : '';
  const kept = `Path=/; SameSite=Lax${where.secure ? '; Secure' : ''}${life}`;
  return [`${where.secure ? '__Host-' : ''}${name}=${encodeURIComponent(token ?? '')}; HttpOnly; ${kept}`, `${name}.held=${token === null ? '' : '1'}; ${kept}`];
};

// The page's origin as its browser sees it: what the request says, else where
// it was addressed and how a proxy in front says it arrived.
const originOf = (request: Request): string => {
  const said = request.headers.get('origin');
  if (said !== null && URL.canParse(said)) return said;
  const here = new URL(request.url);
  const scheme = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || here.protocol.slice(0, -1);
  return `${scheme}://${request.headers.get('host') ?? here.host}`;
};

// THE `Set-Cookie` VALUES that keep `token` in the browser of the page at this
// origin — or, for `null`, take it back. For a sign-in the app answers over
// HTTP (a link redeemed, a provider's callback): set these on the response and
// the page that follows is signed in, having never held the token. `lastsMs`
// is how long the browser keeps it; left out, until the browser closes.
export const sessionCookies = (page: string | Request, token: string | null, options: { key?: string; lastsMs?: number | null } = {}): string[] => {
  const at = new URL(typeof page === 'string' ? page : originOf(page));
  return cookiesAt({ port: at.port, secure: at.protocol === 'https:' }, options.key ?? DEFAULT_TOKEN_KEY, token, options.lastsMs);
};

// What the browser holds for this key, out of a request's `Cookie` header.
// `secure` says which of the two names to read; unknown (a page request does
// not say how it arrived), the one only this host can have set is read first.
export const sessionTokenOf = (
  cookies: string | null | undefined,
  where: { port: string; secure?: boolean },
  key = DEFAULT_TOKEN_KEY,
): { token: string; clear: string[] } | null => {
  const name = nameOf(key, where.port);
  for (const secure of where.secure === undefined ? [true, false] : [where.secure]) {
    const token = tokenFromCookie(cookies, `${secure ? '__Host-' : ''}${name}`);
    if (token !== null) return { token, clear: cookiesAt({ port: where.port, secure }, key, null) };
  }
  return null;
};

// ═══════════════════════════════════════════════════════════════
// THE SEAL — how a sign-in made over the socket reaches that cookie.
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
const sealName = (secure: boolean): string => `${secure ? '__Http-' : ''}nisc.seal`;
const toBase64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
const keyOf = async (seal: string): Promise<CryptoKey> => crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seal)), 'AES-GCM', false, ['encrypt', 'decrypt']);

export const newSeal = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

// The seal a browser sent with an upgrade, and the `Set-Cookie` value that
// gives it one: for the socket's own `path` only, unreadable to script.
export const sealOf = (cookies: string | null | undefined, secure: boolean): string | null => tokenFromCookie(cookies, sealName(secure));
export const sealCookie = (seal: string, where: { secure: boolean; path: string }): string => `${sealName(where.secure)}=${seal}; HttpOnly; Path=${where.path}; SameSite=Lax${where.secure ? '; Secure' : ''}`;

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
    const { token, until } = JSON.parse(new TextDecoder().decode(opened)) as { token?: unknown; until?: unknown };
    return typeof token === 'string' && typeof until === 'number' && until > Date.now() ? token : null;
  } catch {
    return null;
  }
};

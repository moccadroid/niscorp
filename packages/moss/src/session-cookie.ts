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

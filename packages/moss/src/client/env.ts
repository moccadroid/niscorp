import { DEFAULT_TOKEN_KEY, heldCookieName } from '../protocol';

// ═══════════════════════════════════════════════════════════════
// The host seam: what the wire would otherwise take from globals — where the
// token lives, how a socket is constructed, what url "here" means. The wire
// (./wire.ts) never reaches for one: everything host-shaped comes in as a
// `WireEnv`. `browserEnv` (the default) is localStorage + location; `./node`
// ships `nodeEnv` (a token file, an explicit url). The socket API itself is
// WHATWG-standard in every host (browser, Node ≥22, Bun), so an env only
// constructs it.
// ═══════════════════════════════════════════════════════════════

// Where the session token lives between connects.
export type WireTokenStore = {
  load: () => string | null;
  save: (token: string) => void;
  clear: () => void;
  // A host whose BROWSER may keep the session itself, in a cookie the page
  // cannot read (../identity/session-cookie.ts): whether it does, right now. Asked
  // after an upgrade is answered — if it does, the wire lets go of the token
  // it offered and nothing is stored; if not, the token is stored. A host
  // without this (a process) always keeps its own.
  held?: () => boolean;
  // Which of the browser's sessions this terminal is, when not the default one
  // — a seat. Named in the socket's address; it is the cookie's name.
  key?: string;
};

// The host seam: what the wire would otherwise take from globals.
export type WireEnv = {
  tokens: WireTokenStore;
  // Construct a socket for this url, offering these subprotocols —
  // `new WebSocket(url, offered)` in every host. What is offered is who the
  // terminal is (../protocol): a host that drops it connects as nobody.
  socket: (upgrade: { url: string; offered: string[] }) => WebSocket;
  // the socket url when `config.url` is absent
  defaultUrl: () => string;
};

// A page's token store. The try/catches keep a storage-less context (private
// mode, sandboxed iframe) alive: the session then lives for this page only.
const browserTokens = (tokenKey: string, named: boolean): WireTokenStore => ({
  load: () => {
    try {
      return window.localStorage.getItem(tokenKey);
    } catch {
      return null;
    }
  },
  save: (token) => {
    try {
      window.localStorage.setItem(tokenKey, token);
    } catch {
      /* storage unavailable — the session lives for this page only */
    }
  },
  clear: () => {
    try {
      window.localStorage.removeItem(tokenKey);
    } catch {
      /* nothing stored, nothing to clear */
    }
    // a cookie of the same name, which script can read, is expired too
    try {
      document.cookie = `${encodeURIComponent(tokenKey)}=; Path=/; Max-Age=0; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    } catch {
      /* no document, or cookies refused */
    }
  },
  held: () => {
    try {
      return document.cookie.split('; ').includes(`${heldCookieName(tokenKey, window.location.port)}=1`);
    } catch {
      return false;
    }
  },
  ...(named ? { key: tokenKey } : {}),
});

// The browser host: url derived from location, the page's WebSocket, and the
// session wherever this page can have it kept.
//
// SERVED BY THE APP IT TALKS TO, the page does not keep it: the browser does,
// in a cookie the page cannot read, which the server writes in its answer to
// the upgrade (../identity/session-cookie.ts). `held` is all the page sees of it. A
// token this page is handed is offered once and let go of; nothing is stored.
//
// ANYWHERE ELSE — another origin, a browser that refuses cookies — the token
// is in localStorage.
//
// `cookie` is accepted and does nothing: the page is drawn from the browser's
// own cookie.
export const browserEnv = (config: { tokenKey?: string; cookie?: boolean } = {}): WireEnv => ({
  tokens: browserTokens(config.tokenKey ?? DEFAULT_TOKEN_KEY, config.tokenKey !== undefined),
  socket: ({ url, offered }) => new WebSocket(url, offered),
  defaultUrl: () => {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${window.location.host}/socket`;
  },
});

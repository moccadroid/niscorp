import type { ScreenHead } from '@niscorp/nova/document';
import type { ShellHost, ShellSnapshot } from '../shells';

// ═══════════════════════════════════════════════════════════════
// WHAT A DOCUMENT IS HANDED, and what it answers.
//
// Each member is one function or one value of whoever owns it. A document is
// handed no application manifest, no runtime and no server: it asks three
// things of whatever it is given as `server`, and one of each shell host.
// ═══════════════════════════════════════════════════════════════

// WHAT A DOCUMENT ASKS OF A SHELL HOST (../shells): the screen as it stands,
// read without attaching. One function of the host.
export type DocumentHost = Pick<ShellHost, 'snapshot'>;

// WHAT A DOCUMENT ASKS OF A SERVER, and all it asks: who a token is, which
// page a path leads to, and the app's own shell. A `MossServer` is one of
// these, and so is anything else that answers the three.
export type DocumentSource = {
  // Who a token is; null is nobody.
  principalOf: (token: string) => Promise<string | null>;
  // The page a path leads to, with the host that draws it and the input its
  // path carries; undefined for a path that is the app's.
  page: (path: string) => { name: string; host: DocumentHost; inputs: Record<string, Record<string, unknown>> } | undefined;
  // The app's own shell. Absent: the app serves none, and a path that is not
  // a page goes out undrawn.
  shells?: DocumentHost;
};

export type DocumentConfig = {
  server: DocumentSource;
  // The app's index.html, as it would be served undrawn. It must hold the empty
  // root (`root`, default `<div id="root"></div>`) exactly once — that is where
  // the screen goes.
  template: string;
  // What the request named and carried. `host` is its `Host` header: the
  // session cookie's name ends with the port a page is on (../identity,
  // session-cookie.ts), so without it a page on a port is drawn for nobody.
  request: { path: string; cookie?: string | null; host?: string | null };
  // A terminal that draws to a string: the app's kit, bound to one of moss's
  // server targets (`renderSnapshot` from ../terminal/react/server, /vue/server,
  // /dom/server).
  draw: (snapshot: ShellSnapshot) => string | Promise<string>;
  // Attributes for the page's <html>, read off the screen — what a kit would
  // otherwise set from an effect that never runs here (a palette, a scheme).
  // Names are the app's and are written as given; values are escaped.
  htmlAttributes?: (snapshot: ShellSnapshot) => Record<string, string>;
  // The address the site is served at ("https://example.com"). With it, every
  // path's document says its own canonical address. Without it, where a
  // document lives is left as the template says.
  site?: string;
  // The wire's token key, which the session cookie is named by. Default `nisc.token`.
  tokenKey?: string;
  // How long the screen may take to settle before it is drawn as it stands.
  waitMs?: number;
  root?: string;
};

export type DrawnDocument = {
  html: string;
  headers: Record<string, string>;
  // whether the screen is in the page (false: the template went out as it is)
  drawn: boolean;
  // who it was drawn for
  principal: string | null;
  // the page the path led to, when it led to one
  page?: string;
  // what the screen's head held, and the actions that said it — absent when
  // the screen has no head and the document's is the template's own
  head?: ScreenHead;
  // the snapshot's own account of itself (see ShellSnapshot) — present when drawn
  live?: boolean;
  why?: string[];
  drawnWith?: string[];
  settled?: boolean;
};

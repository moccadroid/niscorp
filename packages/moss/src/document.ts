import { headOf, placeHead } from '@niscorp/nova/document';
import type { ScreenHead } from '@niscorp/nova/document';
import type { ShellSnapshot } from './shells';
import type { MossServer } from './server';
import { DEFAULT_TOKEN_KEY, sessionTokenOf, tokenFromCookie } from './session-cookie';

// ═══════════════════════════════════════════════════════════════
// The document — what a page request is answered with when the server draws
// the first screen itself.
//
// A page request names a path and carries, at most, a cookie. From those two:
// WHICH shell (a page's, if the path leads to one; otherwise the app's), for
// WHOM (the cookie's principal, or nobody), read as it stands
// (`shells.snapshot`), drawn to a string by a terminal the app hands in
// (./terminal/react/server and its siblings), and written into the app's own
// index.html beside the snapshot it was drawn from. The browser's terminal
// starts from that snapshot (../client's `readDocumentSnapshot`) and adopts the
// elements already there.
//
// Moss holds no opinion about the page around the screen: the template is the
// app's file, the kit is the app's, and so is the route this is called from.
//
// The page's <head> is a node in a layout too (nova's `nova:head`, holding the
// elements a head holds), so it is in the snapshot's trees like everything
// else on the screen, and is written into the template's <head> as the screen
// is written into its root.
//
// TWO RULES LIVE HERE, each in one place:
//
//   WHO MAY KEEP A PAGE follows from who asked, and from nothing else
//   (`documentHeaders`). A page drawn for nobody is the same for everybody; a
//   page drawn for somebody is theirs. No page declares which it is.
//
//   NOTHING HERE CAN FAIL A PAGE. Whatever goes wrong — a kit component that
//   throws, a shell that will not build — the answer is the template as it is,
//   and the terminal paints it the way it did before any of this existed.
// ═══════════════════════════════════════════════════════════════

// The element id the terminal looks for — the same constant ../client reads by.
export const SNAPSHOT_ELEMENT_ID = 'nisc-snapshot';

const DEFAULT_ROOT = '<div id="root"></div>';

export { tokenFromCookie };

// The snapshot, as an element to put in the page. A tree carries what people
// typed (a name, a note), and it sits inside a <script>: every `<` is written
// as its escape, so nothing in a tree can close the element or open another.
// U+2028/2029 go the same way — legal in JSON, line breaks to an HTML parser.
export const embedSnapshot = (snapshot: ShellSnapshot, principal: string | null, path?: string): string => {
  const { frame, trees, seed, live } = snapshot;
  const text = JSON.stringify({ frame, trees, principal: principal !== null, live, ...(seed !== undefined ? { seed } : {}), ...(path !== undefined ? { path } : {}) })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/json" id="${SNAPSHOT_ELEMENT_ID}">${text}</script>`;
};

// A page drawn for somebody is theirs alone: nothing between here and their
// browser may keep it. A page drawn for nobody is the same for everybody and
// may be kept — but it must never be handed to a request that carried a
// credential, so the two are told apart on the cookie.
export const documentHeaders = (principal: string | null): Record<string, string> =>
  principal === null ? { 'cache-control': 'no-cache', vary: 'Cookie' } : { 'cache-control': 'private, no-store', vary: 'Cookie' };

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export type DocumentConfig = {
  server: MossServer;
  // The app's index.html, as it would be served undrawn. It must hold the empty
  // root (`root`, default `<div id="root"></div>`) exactly once — that is where
  // the screen goes.
  template: string;
  // What the request named and carried. `host` is its `Host` header: the
  // session cookie's name ends with the port a page is on (session-cookie.ts),
  // so without it a page on a port is drawn for nobody.
  request: { path: string; cookie?: string | null; host?: string | null };
  // A terminal that draws to a string: the app's kit, bound to one of moss's
  // server targets (`renderSnapshot` from ./terminal/react/server, /vue/server,
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

export const renderDocument = async (config: DocumentConfig): Promise<DrawnDocument> => {
  const { server, template, request, draw } = config;
  const tokenKey = config.tokenKey ?? DEFAULT_TOKEN_KEY;
  const root = config.root ?? DEFAULT_ROOT;
  const undrawn: DrawnDocument = { html: template, headers: documentHeaders(null), drawn: false, principal: null };
  if (!template.includes(root)) return undrawn;

  try {
    // The session the browser holds (session-cookie.ts). A page request does
    // not say how it arrived, so the name only this host can have set is read
    // before the plain one.
    const token = sessionTokenOf(request.cookie, { port: /:(\d+)$/.exec(request.host ?? '')?.[1] ?? '' }, tokenKey)?.token ?? null;
    // A token that no longer resolves is nobody: the page is drawn for nobody.
    // Nothing is written here — the upgrade is where a browser's cookie is set
    // and taken back (socket.ts), and one writer cannot disagree with itself. A
    // verifier that THROWS is a fault, not a sign-out — the page goes out
    // undrawn and the socket, which asks again, is where it is settled.
    const principal = token === null ? null : await server.principalOf(token);
    const route = server.page(request.path);
    const host = route?.host ?? server.shells;
    if (host === undefined) return undrawn;

    const snapshot = await host.snapshot(principal === null ? null : token, principal, {
      ...(config.waitMs !== undefined ? { waitMs: config.waitMs } : {}),
      ...(route !== undefined ? { inputs: route.inputs } : {}),
    });
    const screen = await draw(snapshot);
    const attributes = Object.entries(config.htmlAttributes?.(snapshot) ?? {})
      .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
      .join('');
    const placed = template
      // functions, both, so nothing in the screen is read as a replacement pattern
      .replace(root, () => `${root.replace('></div>', () => `>${screen}</div>`)}${embedSnapshot(snapshot, principal, request.path)}`)
      .replace(/<html([^>]*)>/, (whole, existing: string) => (attributes === '' ? whole : `<html${existing}${attributes}>`));
    const head = headOf({ frame: () => snapshot.frame, canvasTree: (id) => snapshot.trees[id] ?? [] });
    // what a head may not hold was left out: say so, where somebody can see it
    for (const why of head?.refused ?? []) console.error(`[moss/document] "${request.path}" — ${why}`);
    const html = placeHead(placed, head?.elements, { ...(config.site !== undefined ? { site: config.site } : {}), path: request.path });

    return {
      html,
      ...(head !== undefined ? { head } : {}),
      headers: documentHeaders(principal),
      drawn: true,
      principal,
      ...(route !== undefined ? { page: route.name } : {}),
      live: snapshot.live,
      why: snapshot.why,
      drawnWith: snapshot.drawnWith,
      settled: snapshot.settled,
    };
  } catch (error) {
    console.error(`[moss/document] "${request.path}" could not be drawn — serving it undrawn:`, error);
    return undrawn;
  }
};

// ── pages, as files ──
//
// The same draw, for NOBODY, once per path: what a static host serves. There is
// no credential to pass and no way to pass one — a file is the page as nobody
// in particular sees it, which is the only page that may be kept.
//
// A page that is LIVE is still written, and said so: its file is a true first
// screen, and its terminal will look for a socket. Whether that is acceptable
// (a server stands beside the files) or a mistake (there is no server) is the
// build's to decide, from the report — nothing here guesses.

export type ExportedDocument = {
  path: string;
  html: string;
  page?: string;
  head?: ScreenHead;
  drawn: boolean;
  live: boolean;
  why: string[];
  // reads whose answers are in the file as they were when it was written
  drawnWith: string[];
  settled: boolean;
};

export const exportDocuments = async (config: Omit<DocumentConfig, 'request'> & { paths: readonly string[] }): Promise<ExportedDocument[]> => {
  const { paths, ...rest } = config;
  const out: ExportedDocument[] = [];
  for (const path of paths) {
    const page = await renderDocument({ ...rest, request: { path, cookie: null } });
    out.push({
      path,
      html: page.html,
      ...(page.page !== undefined ? { page: page.page } : {}),
      ...(page.head !== undefined ? { head: page.head } : {}),
      drawn: page.drawn,
      // undrawn is not concluded finished
      live: page.live ?? true,
      why: page.why ?? (page.drawn ? [] : ['the page could not be drawn']),
      drawnWith: page.drawnWith ?? [],
      settled: page.settled ?? false,
    });
  }
  return out;
};

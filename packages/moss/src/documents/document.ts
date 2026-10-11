import { headOf, placeHead } from '@niscorp/nova/document';
import { sessionTokenOf } from '../identity';
import { DEFAULT_TOKEN_KEY, SNAPSHOT_ELEMENT_ID } from '../protocol';
import type { DocumentSnapshot } from '../protocol';
import type { ShellSnapshot } from '../shells';
import type { DocumentConfig, DrawnDocument } from './config';

// What a page request is answered with when the server draws the first screen
// itself: the two rules of ./index.ts, and the draw.

const DEFAULT_ROOT = '<div id="root"></div>';

// The snapshot, as an element to put in the page. A tree carries what people
// typed (a name, a note), and it sits inside a <script>: every `<` is written
// as its escape, so nothing in a tree can close the element or open another.
// U+2028/2029 go the same way — legal in JSON, line breaks to an HTML parser.
export const embedSnapshot = (snapshot: ShellSnapshot, principal: string | null, path?: string): string => {
  const { frame, trees, seed, live } = snapshot;
  const carried: DocumentSnapshot = { frame, trees, principal: principal !== null, live, ...(seed !== undefined ? { seed } : {}), ...(path !== undefined ? { path } : {}) };
  const text = JSON.stringify(carried)
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

// WHERE THE SCREEN GOES: inside the root, which is an EMPTY ELEMENT — an
// opening tag and, at once, its closing tag. Answers the root with a screen
// in it, or undefined for a root with no inside (an opening tag alone, one
// that holds something, one closed in its own tag): there is no place for a
// screen then.
const rootHolding = (root: string): ((screen: string) => string) | undefined => {
  const closing = root.lastIndexOf('</');
  if (closing <= 0 || !root.startsWith('<') || root[closing - 1] !== '>' || !root.endsWith('>')) return undefined;
  return (screen) => `${root.slice(0, closing)}${screen}${root.slice(closing)}`;
};

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export const renderDocument = async (config: DocumentConfig): Promise<DrawnDocument> => {
  const { server, template, request, draw } = config;
  const tokenKey = config.tokenKey ?? DEFAULT_TOKEN_KEY;
  const root = config.root ?? DEFAULT_ROOT;
  const undrawn: DrawnDocument = { html: template, headers: documentHeaders(null), drawn: false, principal: null };
  if (!template.includes(root)) return undrawn;
  const holding = rootHolding(root);
  if (holding === undefined) {
    console.error(`[moss/document] the root ${root} has no place for a screen — a root is an empty element, like ${DEFAULT_ROOT}. "${request.path}" is served undrawn.`);
    return undrawn;
  }

  try {
    // The session the browser holds (../identity, session-cookie.ts). A page
    // request does not say how it arrived, so the name only this host can have
    // set is read before the plain one. Its name ends with the port the page is
    // on: the one the request was addressed to, and — behind a proxy that
    // rewrote `Host` to its own upstream — the one the site says it is served
    // at.
    const ports = [/:(\d+)$/.exec(request.host ?? '')?.[1] ?? '', ...(config.site !== undefined && URL.canParse(config.site) ? [new URL(config.site).port] : [])];
    const token = ports.map((port) => sessionTokenOf(request.cookie, { port }, tokenKey)?.token ?? null).find((found) => found !== null) ?? null;
    // A token that no longer resolves is nobody: the page is drawn for nobody.
    // Nothing is written here — the upgrade is where a browser's cookie is set
    // and taken back (../socket), and one writer cannot disagree with itself. A
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
      .replace(root, () => `${holding(screen)}${embedSnapshot(snapshot, principal, request.path)}`)
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

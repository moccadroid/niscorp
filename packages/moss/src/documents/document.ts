import { headOf, placeHead } from '@niscorp/nova/document';
import type { ScreenHead } from '@niscorp/nova/document';
import type { ShellHost, ShellSnapshot } from '../shells';
import { sessionTokenOf } from '../identity';
import { DEFAULT_TOKEN_KEY, SNAPSHOT_ELEMENT_ID } from '../protocol';
import type { DocumentSnapshot } from '../protocol';

export type DocumentHost = Pick<ShellHost, 'snapshot'>;

export type DocumentSource = {
  principalOf: (token: string) => Promise<string | null>;
  page: (path: string) => { name: string; host: DocumentHost; inputs: Record<string, Record<string, unknown>> } | undefined;
  shells?: DocumentHost;
};

export type DocumentConfig = {
  server: DocumentSource;
  template: string;
  // `host` is the Host header: without it a page on a port is drawn for nobody.
  request: { path: string; cookie?: string | null; host?: string | null };
  draw: (snapshot: ShellSnapshot) => string | Promise<string>;
  htmlAttributes?: (snapshot: ShellSnapshot) => Record<string, string>;
  site?: string;
  tokenKey?: string;
  waitMs?: number;
  // The empty element the screen goes into, as HTML exactly as the template has it.
  root?: string;
};

export type DrawnDocument = {
  html: string;
  headers: Record<string, string>;
  drawn: boolean;
  principal: string | null;
  page?: string;
  head?: ScreenHead;
  live?: boolean;
  why?: string[];
  drawnWith?: string[];
  settled?: boolean;
};

const DEFAULT_ROOT = '<div id="root"></div>';

export const embedSnapshot = (snapshot: ShellSnapshot, principal: string | null, path?: string): string => {
  const { frame, trees, seed, live } = snapshot;
  const carried: DocumentSnapshot = { frame, trees, principal: principal !== null, live, ...(seed !== undefined ? { seed } : {}), ...(path !== undefined ? { path } : {}) };
  const text = JSON.stringify(carried)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/json" id="${SNAPSHOT_ELEMENT_ID}">${text}</script>`;
};

export const documentHeaders = (principal: string | null): Record<string, string> =>
  principal === null ? { 'cache-control': 'no-cache', vary: 'Cookie' } : { 'cache-control': 'private, no-store', vary: 'Cookie' };

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
    // The session cookie's name ends with the port the page is on: the one in Host or, behind a
    // proxy that rewrote Host, the one the site is served at.
    const ports = [/:(\d+)$/.exec(request.host ?? '')?.[1] ?? '', ...(config.site !== undefined && URL.canParse(config.site) ? [new URL(config.site).port] : [])];
    const token = ports.map((port) => sessionTokenOf(request.cookie, { port }, tokenKey)?.token ?? null).find((found) => found !== null) ?? null;
    // A token that no longer resolves is not cleared here: the upgrade is the one place that writes
    // a browser's cookie.
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
      // By functions, so nothing in the screen is read as a replacement pattern.
      .replace(root, () => `${holding(screen)}${embedSnapshot(snapshot, principal, request.path)}`)
      .replace(/<html([^>]*)>/, (whole, existing: string) => (attributes === '' ? whole : `<html${existing}${attributes}>`));
    const head = headOf({ frame: () => snapshot.frame, canvasTree: (id) => snapshot.trees[id] ?? [] });
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

import { readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { serve as listen } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context } from 'hono';
import { renderDocument } from '../documents';
import type { DocumentConfig } from '../documents';
import type { NiscApp } from '../manifest';
import type { NiscRuntime } from '../runtime';
import type { SocketAccept, TransportSettings } from '../socket';
import type { Env, MossServer } from './moss-server';
import { createServer } from './server';
import { createTransport, listenForUpgrades } from './transport';
import type { Upgradeable } from './transport';

// ═══════════════════════════════════════════════════════════════
// The Node entry — runtime-specific by design: the transport is a seam, so
// the Bun flip swaps this file, never the app. Two exports: the
// websocket transport for hosts that run their own listener (the dev
// checks, vite), and the batteries-included `serve`.
// ═══════════════════════════════════════════════════════════════

// The websocket transport on a listener of the host's own: the upgrade
// requests made to `path` are answered through `accept` (./transport.ts).
//
// A HOST THAT ATTACHES A SERVER'S SOCKET SAYS NOTHING MORE. How its
// connections are set (compression, the largest message) is the deployment's,
// and `server.socket` carries it from the runtime. `options` is for a host
// that means otherwise, and for an accept of its own that says nothing.
//
// Answers how the transport is retired: `close()` ends every connection it
// opened (1001, going away) and takes no more. For a host that stops its
// listener while the process goes on; one that exits needs none of it.
export const attachSocket = (
  httpServer: Upgradeable,
  accept: SocketAccept,
  path = '/socket',
  options?: TransportSettings,
): { close: () => void } => {
  const transport = createTransport(accept, options);
  listenForUpgrades(httpServer, path, transport.upgrade);
  return { close: transport.close };
};

// THE BUILT TERMINAL, served by the same process as the app — one origin, so the
// socket is `/socket` wherever the page came from.
//
// `dist` is what the app's bundler wrote: index.html and its assets. Every GET
// that nothing registered earlier answers is a file from it, or a PAGE:
// index.html with the caller's screen drawn into it (../documents) — the app's own
// for `/`, one of the manifest's pages for a path that leads to one. index.html
// itself is never served as a file: it is the template, and goes out drawn.
//
// A name with an extension that is neither a file in `dist` nor a page of the
// manifest is a MISSING FILE, and is answered 404 — not with a screen. A browser
// holding a page from before a deploy asks for that page's script by its old
// name; what it needs back is "gone", not a document that is not a script.
//
// Register the app's own routes FIRST; this is the catch-all. `owned` names the
// prefixes that are never a page (default: moss's own surfaces) — an unknown
// path under one is a 404, not a screen.
export type SiteConfig = Pick<DocumentConfig, 'draw' | 'htmlAttributes' | 'site' | 'tokenKey' | 'waitMs'> & {
  dist: string;
  owned?: RegExp;
};

// The paths the app server answers itself; everything else is the site's.
//
// A CONSTANT, AND IT NAMES A FEATURE'S PREFIX (`integrations`: the proxy, the
// frames and the webhooks of ../integrations). That is the core knowing where
// a feature mounts, and it is left so on purpose, because the three that read
// this cannot all ask a server instead. The dev plugin (./vite.ts) answers an
// owned path `503` when the app did not boot, and a server that did not boot
// cannot say what it owns. `socket` is where a host attached the transport,
// which no server is told. And what is mounted on a server includes the app's
// own routes, which are not owned: a page may share a first segment with one.
// A feature that mounts under a prefix of its own that is not here is served
// by `mountSite` all the same (its routes are registered before the
// catch-all); what it loses is the 404 for an unknown path under that prefix,
// and under the dev plugin its requests go to vite, so an app that names such
// a feature says the prefixes itself (`owned`, here and on `mossDev`).
export const MOSS_PATHS = /^\/(api|catalog|socket|operator|integrations)(\/|$)/;

export const mountSite = (server: MossServer, config: SiteConfig): void => {
  const { dist, owned = MOSS_PATHS, ...drawing } = config;
  // serveStatic resolves `root` against the working directory.
  const root = relative(process.cwd(), dist) || '.';
  const files = serveStatic({ root });
  // The context is typed here because Hono leaves what a route was handed as
  // `any`, and it is handed on to the static server.
  server.use('/*', async (c: Context<Env, string>, next) => {
    const path = c.req.path;
    if (owned.test(path) || path === '/' || path === '/index.html' || server.page(path) !== undefined) return next();
    return files(c, next);
  });
  server.get('*', async (c) => {
    if (owned.test(c.req.path)) return c.notFound();
    // the static server above found no such file, and no page is at this path
    if (extname(c.req.path) !== '' && c.req.path !== '/index.html' && server.page(c.req.path) === undefined) return c.notFound();
    const template = await readFile(join(dist, 'index.html'), 'utf8');
    const page = await renderDocument({
      ...drawing,
      server,
      template,
      request: { path: c.req.path === '/index.html' ? '/' : c.req.path, cookie: c.req.header('cookie') ?? null, host: c.req.header('host') ?? null },
    });
    return c.html(page.html, 200, page.headers);
  });
};

// BOOT AND LISTEN: `createServer`, then HTTP and the socket in one process.
//
// WHAT IT STARTED, THE SERVER IT RETURNS STOPS. `serve` makes a listener and a
// websocket transport and hands back neither, so `close()` on what it does
// hand back is the one way to stop them: moss's own timers (`MossServer`'s
// `close`), then every connection, then the listener. The thing that started
// a listener owns stopping it. It used to stop the timers and leave the port
// bound and every terminal connected.
export const serve = async (app: NiscApp, runtime: NiscRuntime & { port?: number }): Promise<MossServer> => {
  const server = await createServer(app, runtime);
  const port = runtime.port ?? 8787;
  const httpServer = listen({ fetch: server.fetch, port });
  const sockets = attachSocket(httpServer, server.socket);
  console.log(`moss serving http://localhost:${port}`);
  console.log(`surfaces: GET /catalog · GET|POST /api/vex · GET|POST /api/<resource>/vex · ws://localhost:${port}/socket`);
  const retire = server.close;
  return Object.assign(server, {
    close: (): void => {
      retire();
      sockets.close();
      httpServer.close();
    },
  });
};

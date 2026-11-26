import { readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { serve as listen } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { IncomingMessage } from 'node:http';
import type { Context } from 'hono';
import { renderDocument } from '../documents';
import type { DocumentConfig } from '../documents';
import type { NiscApp } from '../manifest';
import type { NiscRuntime } from '../runtime';
import type { SocketAccept, TransportSettings } from '../socket';
import type { Env, MossServer } from '../server';
import { createServer } from '../server';
import { createTransport, listenForUpgrades } from './transport';
import type { Upgradeable } from './transport';

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

export type SiteConfig = Pick<DocumentConfig, 'draw' | 'htmlAttributes' | 'site' | 'tokenKey' | 'waitMs'> & {
  dist: string;
  owned?: RegExp;
};

// Names a feature's prefix (`integrations`) on purpose: the dev plugin answers
// an owned path 503 when the app did not boot, and a server that did not boot
// cannot say what it owns.
export const MOSS_PATHS = /^\/(api|catalog|socket|operator|integrations)(\/|$)/;

// A request the server's own fetch made (an action's endpoint) carries no
// `incoming`: whatever headers it has, it says nothing of a visitor.
const visitorRequestOf = (c: Context<Env, string>): { peer?: string | null; headers?: IncomingMessage['headers'] } => {
  const env: unknown = c.env;
  const incoming = env !== null && typeof env === 'object' && 'incoming' in env ? env.incoming : undefined;
  if (!(incoming instanceof IncomingMessage)) return {};
  return { peer: incoming.socket.remoteAddress ?? null, headers: incoming.headers };
};

export const mountSite = (server: MossServer, config: SiteConfig): void => {
  const { dist, owned = MOSS_PATHS, ...drawing } = config;
  // `serveStatic` resolves `root` against the working directory.
  const root = relative(process.cwd(), dist) || '.';
  const files = serveStatic({ root });
  server.use('/*', async (c: Context<Env, string>, next) => {
    const path = c.req.path;
    if (owned.test(path) || path === '/' || path === '/index.html' || server.page(path) !== undefined) return next();
    return files(c, next);
  });
  server.get('*', async (c) => {
    if (owned.test(c.req.path)) return c.notFound();
    // A name with an extension that the static server did not find is a missing
    // file, not a page: a browser that has a page from before a deploy asks for
    // its old script, and needs a 404.
    if (extname(c.req.path) !== '' && c.req.path !== '/index.html' && server.page(c.req.path) === undefined) return c.notFound();
    const template = await readFile(join(dist, 'index.html'), 'utf8');
    const page = await renderDocument({
      ...drawing,
      server,
      template,
      request: {
        path: c.req.path === '/index.html' ? '/' : c.req.path,
        cookie: c.req.header('cookie') ?? null,
        host: c.req.header('host') ?? null,
        ...visitorRequestOf(c),
      },
    });
    return c.html(page.html, 200, page.headers);
  });
};

export const serve = async (app: NiscApp, runtime: NiscRuntime & { port?: number }): Promise<MossServer> => {
  const server = await createServer(app, runtime);
  try {
    await server.checkFunctions();
  } catch (error) {
    server.close();
    throw error;
  }
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

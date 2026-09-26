import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { MossServer } from '@niscorp/moss';

// THE BUILT TERMINAL (`vite build` → dist/), served by the same process as the
// app — one origin, so the socket is `/socket` wherever the page came from.
// Everything moss answers (`/api`, `/catalog`, `/socket`, `/operator`) and the
// sign-ins (`/login`, `/speaker`, `/stage`) are registered before this and
// never reach it; every other GET is a file, or the one page. There is no client routing (PLAN.md, D5) — `/` is
// the app, and what it shows is decided on the server.
const APP_PATHS = /^\/(api|catalog|socket|operator|login|speaker|stage)(\/|$)/;

export const mountSite = (server: MossServer, dist: string): void => {
  // serveStatic resolves `root` against the working directory.
  const root = relative(process.cwd(), dist) || '.';
  server.use('/*', async (c, next) => (APP_PATHS.test(c.req.path) ? next() : serveStatic({ root })(c, next)));
  server.get('*', async (c) => {
    if (APP_PATHS.test(c.req.path)) return c.notFound();
    return c.html(await readFile(join(dist, 'index.html'), 'utf8'));
  });
};

import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { MossServer } from '@niscorp/moss';

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

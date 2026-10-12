import { PGlite } from '@electric-sql/pglite';
import { serve as listen } from '@hono/node-server';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createServer } from '@niscorp/moss';
import { attachSocket } from '@niscorp/moss/node';
import type { MossServer, NiscRuntime } from '@niscorp/moss';
import { buildAdmin } from './app/app';
import { httpSeam } from './seam';
import type { Seam } from './seam';
import { adminPort, lyraBase, operatorKey } from './port';

// The tool has no data of its own. moss stands its data layer up from a
// runtime, so it gets an unseeded PGlite with no tables.
const adminRuntime = async (): Promise<NiscRuntime> => {
  const db = new PGlite();
  const pool = createPglitePool(db);
  const cache = createPostgresCache({ pool });
  await cache.init();
  return { db, pool, cache, session: 'dev-open' };
};

export const buildAdminServer = async (seam: Seam): Promise<MossServer> => {
  const runtime = await adminRuntime();
  return createServer(buildAdmin(seam), runtime);
};

export const startAdminService = async (): Promise<{ port: number; server: MossServer; close: () => Promise<void> }> => {
  const server = await buildAdminServer(httpSeam(lyraBase(), operatorKey()));
  const port = adminPort();
  const httpServer = listen({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  return { port, server, close: () => new Promise<void>((resolve) => httpServer.close(() => resolve())) };
};

import { PGlite } from '@electric-sql/pglite';
import { serve as listen } from '@hono/node-server';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createServer } from '@niscorp/moss';
import { attachSocket } from '@niscorp/moss/node';
import type { MossServer, NiscRuntime } from '@niscorp/moss';
import { buildAdmin } from './app/app';
import { createSeam } from './seam';
import type { Seam } from './seam';
import { adminPort } from './port';

// The tool has no database, and moss builds its data layer from a runtime, so
// it gets an unseeded PGlite with no tables.
const adminRuntime = async (): Promise<NiscRuntime> => {
  const db = new PGlite();
  const pool = createPglitePool(db);
  const cache = createPostgresCache({ pool });
  await cache.init();
  // Every token is trusted, and moss says so at boot.
  return { db, pool, cache, session: 'dev-open' };
};

export const buildAdminServer = async (seam?: Seam): Promise<{ server: MossServer; runtime: NiscRuntime }> => {
  const runtime = await adminRuntime();
  const server = await createServer(buildAdmin(seam ?? createSeam()), runtime);
  return { server, runtime };
};

export const startAdminService = async (config: { seam?: Seam; port?: number } = {}): Promise<{ port: number; server: MossServer; close: () => Promise<void> }> => {
  const port = config.port ?? adminPort();
  const { server } = await buildAdminServer(config.seam);
  const httpServer = listen({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  return {
    port,
    server,
    close: () => new Promise<void>((resolve) => httpServer.close(() => resolve())),
  };
};

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

// The administration service as a process — a SEPARATE ONE, on its own port and
// its own deploy clock, exactly like the integrations service beside it and for
// a related reason. Integrations do not belong in the app because they are
// somebody else's system; this does not belong in the app because it is not
// part of the product. A hotel buys atrium. Nobody buys this.
//
// Two exports, split where the checks need the seam: `buildAdminServer` composes
// the app over a moss server and stops there, so a check can drive its shells in
// process; `startAdminService` adds the listener.

// The tool has no database. moss stands its data layer up from a runtime, so it
// gets an empty one: an unseeded PGlite whose introspection finds no tables,
// which compiles a policy over an empty grant universe. That is not a stub
// standing in for something missing — it is the accurate shape of an app whose
// every fact lives in another process.
const adminRuntime = async (): Promise<NiscRuntime> => {
  const db = new PGlite();
  const pool = createPglitePool(db);
  const cache = createPostgresCache({ pool });
  await cache.init();
  return { db, pool, cache };
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

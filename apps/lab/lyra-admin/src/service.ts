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

// THE ADMINISTRATION SERVICE AS A PROCESS — a separate one, on its own port and
// its own deploy clock, for the same reason the integrations service beside it
// is separate: integrations do not belong in the app because they are somebody
// else's system, and this does not belong in the app because it is not part of
// the product. A studio buys Lyra. Nobody buys this.
//
// Two exports, split where the checks need the seam: `buildAdminServer` composes
// the app over a moss server and stops there, so a check can drive its shells in
// process; `startAdminService` adds the listener.

// THE TOOL HAS NO DATABASE. moss stands its data layer up from a runtime, so it
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

export const buildAdminServer = async (seam: Seam): Promise<MossServer> => {
  const runtime = await adminRuntime();
  return createServer(buildAdmin(seam), runtime);
};

export const startAdminService = async (): Promise<{ port: number; server: MossServer; close: () => Promise<void> }> => {
  const server = await buildAdminServer(httpSeam(lyraBase(), operatorKey()));
  const port = adminPort();
  const httpServer = listen({ fetch: server.fetch, port });
  // The tool runs on a durable shell like any other nisc app, so it needs the
  // socket too — the terminal that renders it is a second wire on somebody's
  // page, not a page of its own.
  attachSocket(httpServer, server.socket);
  return { port, server, close: () => new Promise<void>((resolve) => httpServer.close(() => resolve())) };
};

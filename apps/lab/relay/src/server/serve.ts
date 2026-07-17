// The relay app server: the artifacts plus a database — the server derives
// the rest. Dev only: `pnpm --filter relay serve`. (The Node listener is
// runtime-specific by design; the Bun flip swaps the import, not the app.)
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from './boot';

const main = async (): Promise<void> => {
  const { server } = await boot();
  const port = Number(process.env['PORT'] ?? 8787);
  const httpServer = serve({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  console.log(`relay app server listening on http://localhost:${port}`);
  console.log(`surfaces: GET /catalog · GET|POST /api/vex · GET|POST /api/<resource>/vex · ws://localhost:${port}/socket`);
};

void main();

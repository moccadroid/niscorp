// The lyra app server, standalone. Dev only: `pnpm --filter lyra serve`.
// The usual way to run this app is `pnpm --filter lyra dev`, which boots the
// same composition inside vite.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from './boot';

const main = async (): Promise<void> => {
  const { server } = await boot();
  const port = Number(process.env['PORT'] ?? 8791);
  const httpServer = serve({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  console.log(`lyra listening on http://localhost:${port}`);
  console.log(`surfaces: GET /catalog · POST /api/vex · ws://localhost:${port}/socket`);
};

void main();

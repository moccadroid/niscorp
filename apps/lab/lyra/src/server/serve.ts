import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { bootDevServer } from './boot';

const main = async (): Promise<void> => {
  const { server } = await bootDevServer();
  const port = Number(process.env['PORT'] ?? 8791);
  const httpServer = serve({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  console.log(`lyra listening on http://localhost:${port}`);
  console.log(`surfaces: GET /catalog · POST /api/vex · ws://localhost:${port}/socket`);
};

void main();

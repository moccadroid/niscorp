// Lyceum standalone: `pnpm --filter lyceum serve`. `pnpm --filter lyceum dev`
// runs the same boot inside vite instead.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from './boot';

const main = async (): Promise<void> => {
  const { server } = await boot();
  const port = Number(process.env['PORT'] ?? 8796);
  const httpServer = serve({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  console.log(`lyceum listening on http://localhost:${port} · ws://localhost:${port}/socket`);
};

void main();

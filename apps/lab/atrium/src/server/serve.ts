// The atrium app server. Dev only: `pnpm --filter atrium serve`.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from './boot';

const main = async (): Promise<void> => {
  const { server } = await boot();
  const port = Number(process.env['PORT'] ?? 8787);
  const httpServer = serve({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  console.log(`atrium listening on http://localhost:${port}`);
  console.log(`surfaces: GET /catalog · POST /api/<resource>/vex · ws://localhost:${port}/socket`);
  console.log('integrations service expected on http://127.0.0.1:8788 — run `pnpm integrations` (the app degrades cleanly without it)');
};

void main();

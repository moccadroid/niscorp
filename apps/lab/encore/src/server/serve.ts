// The encore app server, standalone. Dev only: `pnpm --filter encore serve`.
// `pnpm --filter encore dev` runs the same boot inside vite instead.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from './boot';

const main = async (): Promise<void> => {
  const { server, decider, agent } = await boot();
  const port = Number(process.env['PORT'] ?? 8794);
  const httpServer = serve({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  console.log(`encore listening on http://localhost:${port}`);
  console.log(`surfaces: GET /catalog · POST /api/<resource>/vex · ws://localhost:${port}/socket`);
  console.log(`decision provider: ${decider.id}`);
  console.log(`agent: ${agent.id}${agent.model === '' ? '' : ` · ${agent.model}`}`);
};

void main();

// The relay app server: the artifacts plus a database — the server derives
// the rest. Dev only: `pnpm --filter relay serve`. (The Node listener is
// runtime-specific by design; the Bun flip swaps the import, not the app.)
import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from './boot';

// The F12-console terminal bundle (`pnpm console` builds it) — served with
// CORS so `fetch(...).then(eval)` works from any origin's devtools.
const consoleRoute = (): Response => {
  try {
    const body = readFileSync(new URL('../../dist/console.js', import.meta.url), 'utf8');
    return new Response(body, { headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } });
  } catch {
    return new Response('// no bundle — run `pnpm console` first\n', { status: 404, headers: { 'content-type': 'text/javascript' } });
  }
};

const main = async (): Promise<void> => {
  const { server } = await boot();
  const port = Number(process.env['PORT'] ?? 8787);
  const fetch = (request: Request, ...rest: unknown[]): Response | Promise<Response> =>
    new URL(request.url).pathname === '/console.js' ? consoleRoute() : (server.fetch as (...args: unknown[]) => Response | Promise<Response>)(request, ...rest);
  const httpServer = serve({ fetch, port });
  attachSocket(httpServer, server.socket);
  console.log(`relay app server listening on http://localhost:${port}`);
  console.log(`surfaces: GET /catalog · GET|POST /api/vex · GET|POST /api/<resource>/vex · GET /console.js · ws://localhost:${port}/socket`);
};

void main();

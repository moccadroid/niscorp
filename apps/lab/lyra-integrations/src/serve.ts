try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { mountIntegration } from './integration';
import { beltsIntegration } from './integrations/belts';
import { stripeIntegration } from './integrations/stripe';
import { brokenIntegration, hookClaimIntegration } from './integrations/fixtures';

const INTEGRATIONS = [beltsIntegration, stripeIntegration, brokenIntegration, hookClaimIntegration];

const app = new Hono();
for (const integration of INTEGRATIONS) mountIntegration(app, integration);

const defaultPort = (): number => Number(process.env['INTEGRATIONS_PORT'] ?? 8799);

export const startIntegrations = (at?: number): { close: () => Promise<void>; port: number } => {
  const port = at ?? defaultPort();
  const server = serve({ fetch: app.fetch, port });
  // Closed and awaited: a listening socket torn down by `process.exit` trips a
  // libuv assertion on Windows and the process aborts with 127.
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        // `close` alone waits for keep-alive sockets the fetch left open. The
        // 25 ms lets libuv finish the teardown before the caller exits.
        (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close(() => setTimeout(resolve, 25));
      }),
  };
};

export { app as integrationsApp };

if (process.argv[1]?.includes('serve') === true || process.env['INTEGRATIONS_STANDALONE'] === '1') {
  const running = startIntegrations();
  console.log(`[lyra-integrations] listening on ${running.port}`);
}

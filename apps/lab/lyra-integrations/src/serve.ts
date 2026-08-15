// .env first — LYRA_VERIFY_KEY lives there: the deployment's PUBLIC verify
// key, read off `GET /api/integrations/verify-key` on the lyra this serves.
// Not a secret — holding it only verifies — but without it this service can
// trust no identity claim, so it refuses every identity-bearing request, which
// is the correct default and a confusing one to debug if the file is never read.
try {
  process.loadEnvFile();
} catch {
  /* no .env present — identity routes refuse everything, deliberately */
}

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { mountIntegration } from './integration';
import { beltsIntegration } from './integrations/belts';
import { stripeIntegration } from './integrations/stripe';
import { brokenIntegration, hookClaimIntegration } from './integrations/fixtures';

// THE INTEGRATIONS SERVICE.
//
// A separate process with its own storage. It shares no code with Lyra — the
// only dependency is `@niscorp/nova`, for the shape of an action, which is a
// protocol library and not somebody else's application.
//
// This file used to BE the integration: one Hono app, every route written out
// with its prefix, the audience a literal at each call site, state in a
// module-level array. It hosts integrations now and knows nothing about any of
// them — what an integration is lives in `integration.ts`, and what Belts is
// lives in `integrations/belts`.
//
// Adding one is one line in the list below.
const INTEGRATIONS = [beltsIntegration, stripeIntegration, brokenIntegration, hookClaimIntegration];

const app = new Hono();
for (const integration of INTEGRATIONS) mountIntegration(app, integration);

// THE PORT IS AN ARGUMENT, and read lazily when it is not given.
//
// It was a module-level constant, so a check importing this file could not
// choose one — and every check that started the service therefore fought the
// service already running for development. The visible result was a screen
// reporting 'the service did not answer with a bundle', over and over, because
// running the suite had killed it.
//
// A check takes its own port now and the two never meet.
const defaultPort = (): number => Number(process.env['INTEGRATIONS_PORT'] ?? 8799);

export const startIntegrations = (at?: number): { close: () => Promise<void>; port: number } => {
  const port = at ?? defaultPort();
  const server = serve({ fetch: app.fetch, port });
  // CLOSED AND AWAITED, not left to the process teardown. A listening socket
  // torn down by `process.exit` trips a libuv assertion on Windows and aborts
  // with 127 — which a check runner reads as a failure, after the check has
  // already printed that it passed.
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        // `closeAllConnections` first: `close` alone waits for keep-alive sockets
        // the fetch left open, and the handle is still mid-teardown when the
        // caller exits. The extra tick lets libuv finish before that happens.
        (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close(() => setTimeout(resolve, 25));
      }),
  };
};

export { app as integrationsApp };

// STARTS WHEN RUN, not only when a flag says so. The flag existed so that a
// check importing this file did not accidentally bind a port — which is no
// longer a risk, because a check passes its own. Requiring it meant the launch
// config had to remember an environment variable to start a server, and it did
// not, so the service was never running when anybody looked.
if (process.argv[1]?.includes('serve') === true || process.env['INTEGRATIONS_STANDALONE'] === '1') {
  const running = startIntegrations();
  console.log(`[lyra-integrations] listening on ${running.port}`);
}

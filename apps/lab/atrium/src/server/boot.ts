try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { createServer } from '@niscorp/moss';
import type { MossServer, NiscApp } from '@niscorp/moss';
import { buildAtrium } from '@atrium/app/app';
import { loadDirectory } from './users';
import { loadBundles, registerRefresh, syncIntegrations } from './bundles';
import { mountOperator } from './operator';
import { devRuntime } from './runtime';
import type { DevRuntime } from './runtime';

const chase = (runtime: DevRuntime, pending: readonly string[], delay = 2000): void => {
  if (pending.length === 0) return;
  setTimeout(() => {
    void (async () => {
      const still: string[] = [];
      for (const id of pending) {
        const [report] = await syncIntegrations(runtime, id);
        if (report?.ok === true) console.log(`[atrium] sync ${id}: landed on retry`);
        else if (report?.kind === 'unreachable') still.push(id);
        else console.warn(`[atrium] sync ${id}: ${report?.reasons.join('; ') ?? 'no such connector'}`);
      }
      chase(runtime, still, Math.min(delay * 2, 30_000));
    })();
  }, delay).unref();
};

export const boot = async (): Promise<{
  server: MossServer;
  runtime: DevRuntime;
  app: NiscApp;
}> => {
  const runtime = await devRuntime();
  await loadDirectory(runtime.pool);

  const { entries, actions } = await loadBundles(runtime);

  const app = buildAtrium(runtime);
  const server = await createServer(app, runtime);
  // The entries go first, so no action is served before the reads it replays.
  await server.replaceEntries('bundles', entries);
  server.replaceActions('bundles', actions);

  registerRefresh(runtime, async () => {
    // Both taken from one load: `loadBundles` answers the registry itself,
    // which the next load refills while this one waits on the entries.
    const { entries: freshEntries, actions: freshActions } = await loadBundles(runtime);
    await server.replaceEntries('bundles', freshEntries);
    server.replaceActions('bundles', freshActions);
  });

  mountOperator(server, runtime, app);

  // Not under `/integrations/`: moss serves `/integrations/:id/*` itself, for its
  // own integrations table, and registers it ahead of anything mounted here.
  server.all('/connectors/:connector/*', async (c) => {
    if (c.get('principal') === null) return c.json({ message: 'Sign in first.' }, 401);
    const connectorId = c.req.param('connector');
    const rows = await runtime.pool.query('SELECT service_url FROM connectors WHERE id = $1', [connectorId]);
    const serviceUrl = rows.rows[0]?.['service_url'];
    if (serviceUrl === undefined) return c.json({ message: 'No such connector.' }, 404);
    const rest = c.req.path.split('/').slice(3).join('/');
    try {
      const response = await fetch(`${String(serviceUrl)}/${rest}`, {
        method: c.req.method,
        headers: { 'content-type': 'application/json' },
        ...(c.req.method === 'GET' ? {} : { body: await c.req.text() }),
      });
      return new Response(response.body, {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    } catch {
      return c.json({ message: 'The connector service is unreachable.' }, 502);
    }
  });

  // After `registerRefresh`: the sync calls `refreshServer`. A connector that fails is reported, never fatal.
  const reports = await syncIntegrations(runtime);
  for (const report of reports) {
    if (!report.ok) console.warn(`[atrium] sync ${report.connector}: ${report.reasons.join('; ')}`);
  }
  chase(
    runtime,
    reports.filter((r) => r.kind === 'unreachable').map((r) => r.connector),
  );

  return { server, runtime, app };
};

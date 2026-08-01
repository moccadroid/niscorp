// .env (LLM keys) loads first — Node's own loader, no dependency; a missing
// file is fine (nothing LLM-shaped runs without a key, and says so).
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

// The one composition: atrium's artifacts plus a database → the server. Used
// three ways — the standalone listener, vite's dev plugin (in-process, one
// `pnpm dev`), and the checks (in-process, no port, `runtime.db` as SQL ground
// truth).
//
// Order matters and tells the story:
//   directory  — the seed's people, snapshotted for `inputs`/`scope`
//   bundles    — the integrations' rows, read back into bundleState
//   server     — verifies the whole (charter over core + bundle ids) or refuses
//   refresh    — re-runs the middle two against the live server
//   sync       — PULLS every connector's /bundle through intake; on a fresh
//                database this is where the integrations arrive at all. A
//                service that is down or refused just reports — the app boots
//                core-only and the next sync completes it.
// A vendor whose service was not up when we asked is a TRANSIENT condition,
// so boot keeps asking: the connectors that were unreachable are retried,
// backing off to half a minute, until each one lands. Every success runs the
// full sync path, which means a late vendor's surfaces arrive in shells that
// are already open — nobody reloads, and nobody has to know a service was
// slow to start.
//
// Only `unreachable` is chased. A payload intake REFUSED is a bug in that
// bundle and will still be a bug in thirty seconds; it waits for the vendor
// to fix it and press Pull. Timers are unref'd, so this never holds a process
// open — a check that boots and exits is unaffected.
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

  const bundles = await loadBundles(runtime);

  const app = buildAtrium(bundles.actions, bundles.entries);
  const server = await createServer(app, runtime);

  registerRefresh(async () => {
    // Re-read the rows into the SAME record the server resolves from — ext.*
    // ids are the bundle namespace, so stale ones leave and new ones arrive —
    // then moss re-verifies, drops its memos and walks the living shells.
    const fresh = await loadBundles(runtime);
    for (const id of Object.keys(app.actions)) {
      if (id.startsWith('ext.')) delete app.actions[id];
    }
    Object.assign(app.actions, fresh.actions);
    server.refresh();
  });

  // The operator seam — key-gated, and 404 to the whole world when no key is
  // set. It is not a surface of the application: no principal reaches it and
  // no charter role grants it. Our administration tool is the only client.
  mountOperator(server, runtime, app);

  // The connector proxy: bundle actions call `/integrations/<connector>/...`
  // and the app forwards to that connector's service_url — the row decides
  // where, the same row the resync reads. Auth rides the normal middleware;
  // anonymous gets nothing.
  server.all('/integrations/:connector/*', async (c) => {
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
      // A connector that is down is an ordinary condition: the action's
      // onError shows the sentence; nothing is claimed.
      return c.json({ message: 'The connector service is unreachable.' }, 502);
    }
  });

  // The discovery pull. Every connector's /bundle, through intake, into rows
  // — and refreshServer() inside the sync folds what landed into the running
  // manifest. Failures are per-connector and reported, never fatal: the app
  // is up either way.
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

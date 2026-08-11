import { createServer } from '@niscorp/moss';
import type { MossServer, NiscApp } from '@niscorp/moss';
import type { Tide } from '@niscorp/tide';
import { buildLyra } from '@lyra/app/app';
import { COMPONENT_NAMES } from '@lyra/ui/registry';
import { everyone, installedFor, integrationActorFor, loadDirectory, personById, rolesOf, studioHorizon, studioToday } from './users';
import { loadThemes, themeFor } from './themes';
import { devRuntime } from './runtime';
import { reflexesForEveryStudio, wireTide } from './tide';
import type { DevRuntime } from './runtime';

// The one composition: lyra's artifacts plus a database → the server. Used
// three ways — the standalone listener, vite's dev plugin (in-process, one
// `pnpm dev`), and the checks (in-process, no port, `runtime.db` as SQL ground
// truth).
//
// Order matters and tells the story:
//   runtime    — schema and seed, on a fresh PGlite
//   directory  — who exists and where, snapshotted for `scope` and `inputs`
//   themes     — each studio's palette, same reason
//   server     — verifies the charter against the shipped actions, or refuses
// Reflexes are ROWS, so loading them is a read — and re-loading them is what a
// studio editing one has to trigger. Exported because the screen calls it.
export const reloadReflexes = async (pool: import('@niscorp/vex').PgPool, tide: Tide): Promise<number> => {
  const studios = await pool.query('SELECT id, timezone FROM studios ORDER BY id');
  const rows = await pool.query('SELECT id, studio_id, audience, effect, enabled, run_at, trial_days, subject, body FROM automations');
  const reflexes = reflexesForEveryStudio(
    studios.rows as { id: string; timezone: string }[],
    rows.rows as never,
  );
  await tide.load(reflexes, { at: Date.now() });
  return reflexes.length;
};

export const boot = async (): Promise<{ server: MossServer; runtime: DevRuntime; app: NiscApp; tide: Tide }> => {
  const runtime = await devRuntime();
  await loadDirectory(runtime.pool);
  await loadThemes(runtime.pool);

  // The manifest is built BEFORE the server exists, and the ACL refresh needs
  // the server — so it gets a getter rather than a reference. The alternative
  // is a mutable module-level binding, which is the same circle with worse
  // manners.
  let built: MossServer | undefined;
  let tide: Tide | undefined;
  const app = buildLyra(
    { person: personById, everyone, themeFor, todayFor: studioToday, horizonFor: studioHorizon, rolesOf, installedFor, integrationActor: integrationActorFor },
    {
      pool: runtime.pool,
      server: () => (built === undefined ? (() => { throw new Error('boot: the server is not up yet'); })() : built),
      tide: () => (tide === undefined ? (() => { throw new Error('boot: tide is not up yet'); })() : tide),
    },
  );

  // The server holds the component vocabulary too: it validates a layout's
  // components and props before serving it, which is what will let a studio's
  // replacement layout be refused server-side rather than discovered broken in
  // somebody's browser.
  if (app.shell !== undefined) {
    app.shell.components = Object.fromEntries(COMPONENT_NAMES.map((name) => [name, {}]));
  }

  const server = await createServer(app, runtime);
  built = server;

  // Tide LAST, because its seams call the server's own vex surface — an
  // automation reaches the database exactly as a browser does, through the
  // compiled policy of the studio's automation principal.
  //
  // Reflexes are derived per studio rather than authored per tenant, the same
  // pressure  is under and the same answer: rows when the artifact
  // layer lands, derivation until then.
  //
  // Nothing TICKS here. The host owns wake-up, and in this app that is a check
  // marching a clock or an operator pressing Run — a dev server quietly lapsing
  // memberships in the background is a surprise nobody asked for.
  tide = wireTide({ server: () => server, now: () => Date.now() });
  await reloadReflexes(runtime.pool, tide);

  return { server, runtime, app, tide };
};

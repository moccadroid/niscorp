import { createServer, createTideDriver } from '@niscorp/moss';
import type { MossServer, NiscApp, TideDriver } from '@niscorp/moss';
import type { Tide } from '@niscorp/tide';
import { buildLyra } from '@lyra/app/app';
import { COMPONENT_NAMES } from '@lyra/ui/registry';
import { everyone, installedFor, integrationActorFor, loadDirectory, personById, rolesOf, studioCountry, studioHorizon, studioLocale, studioToday } from './users';
import { loadThemes, themeFor } from './themes';
import { greetingFor, loadPhrases, loadedLocales, phrasesFor } from './phrases';
import { registerDevPacks } from './dev-packs';
import { devRuntime } from './runtime';
import { reflexesForEveryStudio, wireTide } from './tide';
import type { DevRuntime } from './runtime';

export const reloadReflexes = async (pool: import('@niscorp/vex').PgPool, tide: Tide): Promise<number> => {
  const studios = await pool.query('SELECT id, timezone FROM studios ORDER BY id');
  const rows = await pool.query('SELECT id, studio_id, moment, effect, enabled, run_at, days, subject, body FROM automations');
  const reflexes = reflexesForEveryStudio(
    studios.rows as { id: string; timezone: string }[],
    rows.rows as never,
  );
  await tide.load(reflexes, { at: Date.now() });
  // The loaded set changed, so what is due changed with it — re-plan the
  // sleep and drain anything the new set can now consume.
  void driver?.wake();
  return reflexes.length;
};

// Module-level so `reloadReflexes` (called by the automations screen long
// after boot) can nudge it without threading it through every caller.
let driver: TideDriver | undefined;
export const tideDriver = (): TideDriver => {
  if (driver === undefined) throw new Error('boot: the tide driver is not up yet');
  return driver;
};

// HOW EACH AUTOMATION LAST RAN, MIRRORED ONTO ITS OWN ROW.
//
// The card wants one line per automation; the ledger is keyed by a COMPOSED
// reflex id (`<studioId>:<automationId>`), which is a join no foreign key
// can carry and no vex entry can express. So the engine's ledger pushes to
// the automation instead — the counter-cache this schema already runs for
// booked seats and the anchor's relationships, and for the same reason:
// recompute on write, read as a column.
//
// It is created HERE and not in schema.ts because `tide_run` belongs to
// moss and does not exist until the store stands up. Recomputed from the
// newest run rather than incremented, so a re-settled run cannot drift it.
//
// These writes are the engine's own bookkeeping and go through the pool, not
// vex — so they mint no facts, and a reflex settling cannot wake a reload of
// itself.
const wireRunMirror = async (pool: import('@niscorp/vex').PgPool): Promise<void> => {
  await pool.query(/* sql */ `
    CREATE OR REPLACE FUNCTION mirror_last_run() RETURNS TRIGGER AS $mirror$
    BEGIN
      UPDATE automations a
         SET last_run_state  = NEW.state,
             last_run_done   = NEW.done,
             last_run_failed = NEW.failed
       WHERE NEW.reflex_id = a.studio_id || ':' || a.id;
      RETURN NEW;
    END;
    $mirror$ LANGUAGE plpgsql;
  `);
  await pool.query('DROP TRIGGER IF EXISTS mirror_last_run_row ON tide_run');
  await pool.query(/* sql */ `
    CREATE TRIGGER mirror_last_run_row
    AFTER INSERT OR UPDATE OF state, done, failed ON tide_run
    FOR EACH ROW EXECUTE FUNCTION mirror_last_run();
  `);
};

export const boot = async (): Promise<{ server: MossServer; runtime: DevRuntime; app: NiscApp; tide: Tide }> => {
  const runtime = await devRuntime();
  await loadDirectory(runtime.pool);
  await loadThemes(runtime.pool);
  await loadPhrases(runtime.pool);

  let built: MossServer | undefined;
  let tide: Tide | undefined;
  const app = buildLyra(
    { person: personById, everyone, themeFor, todayFor: studioToday, horizonFor: studioHorizon, countryFor: studioCountry, localeFor: studioLocale, phrasesFor, localesFor: loadedLocales, greetingFor: (name, studioId) => greetingFor(name, studioLocale(studioId), new Date()), rolesOf, installedFor, integrationActor: integrationActorFor },
    {
      pool: runtime.pool,
      server: () => (built === undefined ? (() => { throw new Error('boot: the server is not up yet'); })() : built),
      tide: () => (tide === undefined ? (() => { throw new Error('boot: tide is not up yet'); })() : tide),
      driver: tideDriver,
      reloadAutomations: async () => (tide === undefined ? 0 : reloadReflexes(runtime.pool, tide)),
    },
  );

  if (app.shell !== undefined) {
    app.shell.components = Object.fromEntries(COMPONENT_NAMES.map((name) => [name, {}]));
  }

  const server = await createServer(app, runtime);
  built = server;

  tide = wireTide({ server: () => server, now: () => Date.now(), pool: runtime.pool });
  // No beat. The driver wakes on every ingest (the vex bridge mints through
  // it), sleeps until tide's own nextDue instant, and keeps a slow janitor
  // for recovery — the 60-second metronome this replaced was both a latency
  // floor and a throughput ceiling.
  driver?.stop();
  driver = createTideDriver({ tide, retention: { facts: 7 * 24 * 3_600_000, tasks: 30 * 24 * 3_600_000, runs: 30 * 24 * 3_600_000 } });
  // AFTER the first load, not merely after the store is constructed: the
  // store migrates lazily on first use, so `tide_run` does not exist until
  // something reads it — and `load` is the first thing that does.
  await reloadReflexes(runtime.pool, tide);
  await wireRunMirror(runtime.pool);

  return { server, runtime, app, tide };
};

// DEV ONLY, and DELIBERATELY NOT PART OF `boot()`.
//
// `boot()` is shared: the dev server calls it, and so does every check (via
// world.ts). Auto-registering packs inside it leaked into the checks — a check
// imports the integrations service, whose module load reads THIS app's `.env`,
// so `LYRA_DEV_PACKS` was set by the time boot ran and the store came up
// pre-registered, breaking the check's own registration.
//
// So it lives here, called only by the two real dev entry points (the vite
// plugin and the standalone listener). A check never calls it. No-op unless
// `LYRA_DEV_PACKS` is set — see dev-packs.ts.
export const bootDevServer = async (): Promise<Awaited<ReturnType<typeof boot>>> => {
  const booted = await boot();
  await registerDevPacks(booted.server, booted.runtime.pool, booted.runtime.operatorKey ?? '', () => loadDirectory(booted.runtime.pool));
  return booted;
};

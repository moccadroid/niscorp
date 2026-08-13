import { createServer, createTideDriver, mintDevToken } from '@niscorp/moss';
import { redeemLink } from './links';
import { unsubscribe } from './unsubscribe';
import { readMailEvent } from './mail/send';
import type { MossServer, NiscApp, TideDriver } from '@niscorp/moss';
import type { Tide } from '@niscorp/tide';
import { buildLyra } from '@lyra/app/app';
import { COMPONENT_NAMES } from '@lyra/ui/registry';
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
  let built: MossServer | undefined;
  let tide: Tide | undefined;
  const app = buildLyra(
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

  // ── THE OTHER DOOR NOBODY SIGNS IN AT ────────────────────────
  //
  // GET, because a mailbox provider's one-click unsubscribe issues a POST and
  // a human clicking the footer issues a GET, and both must work. It is
  // idempotent either way: unsubscribing twice is unsubscribing.
  //
  // Answers HTML rather than JSON — the only surface in this app a person
  // reaches without a shell, so it has to say something a human can read.
  const farewell = (message: string): string =>
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Unsubscribed</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1.5rem">` +
    `<p>${message}</p></body>`;

  const stop = async (c: { req: { param: (name: string) => string | undefined } }): Promise<Response> => {
    const done = await unsubscribe(runtime.pool, c.req.param('token') ?? '');
    // ONE ANSWER EITHER WAY. A forged token and an already-unsubscribed person
    // read the same, because the alternative is a page that confirms guesses.
    return new Response(
      farewell(
        done === null
          ? 'That link is not one we recognise. If you are still hearing from a studio you would rather not, reply to one of their emails and they will take you off.'
          : 'Done — you will not hear from this studio again. Anything you have booked still stands, and they can still write to you about it.',
      ),
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  };

  // ── WHAT HAPPENED AFTER WE HANDED IT OVER ────────────────────
  //
  // The provider's own voice, and the only thing that can make "Sent" mean
  // more than "they took it". No principal — a vendor calling in has none and
  // could not have one — so the signature IS the authentication, checked over
  // the RAW body before anything is parsed.
  //
  // ALWAYS 200, even for a forged call. A webhook sender reads a 4xx as "retry
  // this forever"; a refusal that says so is a refusal that gets replayed at
  // us all night. Nothing happened, and nothing needs to be said about it.
  server.post('/api/mail/events', async (c) => {
    const raw = await c.req.text();
    const headers: Record<string, string> = {};
    for (const name of ['svix-id', 'svix-timestamp', 'svix-signature']) headers[name] = c.req.header(name) ?? '';
    const event = readMailEvent(headers, raw, Date.now());
    if (event === null) return c.json({ ok: true }, 200);

    // These writes carry no identity and go through the pool, like the
    // unsubscribe door and for the same reason: there is nobody to be. Each is
    // one narrow statement, addressed by the provider's own id or by an
    // address the provider just told us about.
    if (event.kind === 'delivered') {
      await runtime.pool.query('UPDATE outbox SET delivered_at = now() WHERE provider_message_id = $1', [event.id]);
      return c.json({ ok: true });
    }
    if (event.kind === 'bounced' || event.kind === 'complained') {
      const studio = await runtime.pool.query('SELECT studio_id FROM outbox WHERE provider_message_id = $1', [event.id]);
      const studioId = String((studio.rows[0] as { studio_id?: string } | undefined)?.studio_id ?? '');
      // A BOUNCE IS ABOUT THE ADDRESS and holds everywhere; a COMPLAINT is
      // about the relationship and holds at the studio complained about.
      const scope = event.kind === 'bounced' ? '' : studioId;
      await runtime.pool.query(
        `INSERT INTO mail_suppressions (address, studio_id, kind, reason) VALUES ($1, $2, $3, $4)
         ON CONFLICT (address, studio_id) DO UPDATE SET kind = EXCLUDED.kind, reason = EXCLUDED.reason`,
        [event.to, scope, event.kind, event.reason],
      );
      await runtime.pool.query("UPDATE outbox SET state = 'failed', failed_reason = $2 WHERE provider_message_id = $1", [event.id, event.reason]);
      // Somebody reporting a studio's mail as spam has withdrawn consent by
      // any reading of it, whatever a checkbox says.
      if (event.kind === 'complained' && studioId !== '') {
        await runtime.pool.query(
          'UPDATE studio_people SET marketing_ok = false WHERE studio_id = $1 AND person_id = (SELECT person_id FROM outbox WHERE provider_message_id = $2)',
          [studioId, event.id],
        );
      }
    }
    return c.json({ ok: true });
  });

  server.get('/api/unsubscribe/:token', stop);
  server.post('/api/unsubscribe/:token', stop);

  // ── THE ONE DOOR A SIGN-IN LINK KNOCKS ON ────────────────────
  //
  // Public, because nobody redeeming a link has a session yet — that is what
  // they are here to get. The nonce is the whole credential and it is spent by
  // the same statement that reads it, so this route holds no logic worth
  // attacking: it either names a live row or it does not.
  //
  // Under `/api/` because the dev server forwards that prefix (vite.config)
  // and moss's own `/api/*` middleware only attaches the tide chain context —
  // there is no principal gate to slip past, and `/api/:resource/vex` cannot
  // collide with a literal second segment.
  //
  // ⟲ The link used to BE the session: `?token=` went into localStorage
  // untouched. Trading it here is the difference between mailing somebody a
  // key and mailing them a doorbell.
  server.post('/api/auth/redeem', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { nonce?: unknown };
    const personId = await redeemLink(runtime.pool, String(body.nonce ?? ''), Date.now());
    // One sentence for expired, spent and never-existed alike. Which of the
    // three it was is not the caller's business, and answering differently
    // would make this a place to test nonces against.
    if (personId === null) return c.json({ message: 'That sign-in link has expired or has already been used.' }, 401);
    return c.json({ token: mintDevToken(personId) });
  });
  built = server;

  tide = wireTide({ server: () => server, now: () => Date.now(), pool: runtime.pool, base: () => process.env['LYRA_BASE'] ?? 'http://localhost:5180' });
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
  await registerDevPacks(booted.server, booted.runtime.pool, booted.runtime.operatorKey ?? '', async () => { booted.server.refresh(); });
  return booted;
};

// HOW EACH AUTOMATION LAST RAN, MIRRORED ONTO ITS OWN ROW.
//
// The card wants one line per automation; the ledger is keyed by a COMPOSED
// reflex id (`<studioId>:<automationId>`), which is a join no foreign key can
// carry and no vex entry can express. So the engine's ledger pushes to the
// automation instead — the counter-cache this schema already runs for booked
// seats, and for the same reason: recompute on write, read as a column.
//
// DECLARED here as schema, like every other trigger this database carries —
// not created imperatively at boot. It lives in its own file rather than
// schema.ts because `tide_run` is moss's table (TIDE_DDL), so the database
// builder applies this AFTER the tide tables exist.
export const TIDE_MIRROR_DDL = /* sql */ `
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

  DROP TRIGGER IF EXISTS mirror_last_run_row ON tide_run;
  CREATE TRIGGER mirror_last_run_row
  AFTER INSERT OR UPDATE OF state, done, failed ON tide_run
  FOR EACH ROW EXECUTE FUNCTION mirror_last_run();
`;

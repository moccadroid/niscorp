// Outside schema/ because `tide_run` comes from TIDE_DDL: the database builder
// applies this after the tide tables exist.
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

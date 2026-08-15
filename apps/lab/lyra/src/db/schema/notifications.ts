// The studio being told things: notices, and the ones that need doing.
export const NOTIFICATIONS_DDL = /* sql */ `
  -- A NOTIFICATION is "the studio was told something". A TASK is a
  -- notification that needs action — it has a due date and can be ticked
  -- done. One table, actionable-ness a property, because "what has the studio
  -- been told" is one question and filing it in two places made half of it
  -- unfindable.
  --
  -- An insert here also FANS OUT over the per-principal socket to the
  -- studio's connected staff (app.ts onMutation) — a toast and a bell, with
  -- no navigation. This table is the archive that push reads from and the
  -- pull list for whoever was not connected.
  CREATE TABLE notifications (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    person_id   TEXT REFERENCES people(id),
    -- What to do and why, in the studio's own words — the automation supplies
    -- the sentence, with the row's facts filled in.
    title       TEXT NOT NULL,
    detail      TEXT NOT NULL DEFAULT '',
    -- Set = a task ("call Ruben about the failed payment"). NULL = an FYI
    -- ("payment failed") that nobody has to tick off.
    due_on      DATE DEFAULT CURRENT_DATE,
    done        BOOLEAN NOT NULL DEFAULT false,
    -- Read vs unread — what the bell badge counts. Set for the whole studio
    -- when somebody opens the Notices screen: a six-person studio shares one
    -- inbox, and one person reading it IS the studio being told. The flag is
    -- what a screen may write; WHEN is the database's to say (trigger below) —
    -- the same split every other date here keeps.
    seen        BOOLEAN NOT NULL DEFAULT false,
    seen_at     TIMESTAMPTZ,
    source      TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (studio_id, source, person_id, due_on)
  );

  CREATE OR REPLACE FUNCTION stamp_notification_seen() RETURNS TRIGGER AS $seen$
  BEGIN
    IF NEW.seen AND NOT OLD.seen THEN
      NEW.seen_at := now();
    END IF;
    RETURN NEW;
  END;
  $seen$ LANGUAGE plpgsql;

  CREATE TRIGGER notifications_stamp_seen
    BEFORE UPDATE OF seen ON notifications
    FOR EACH ROW EXECUTE FUNCTION stamp_notification_seen();

  CREATE INDEX notifications_open   ON notifications (studio_id, done, due_on);
  CREATE INDEX notifications_unseen ON notifications (studio_id, seen_at);
`;

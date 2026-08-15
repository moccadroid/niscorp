// Holding a seat and turning up: capacity, the waitlist behind it, and the
// check-in that spends a pass credit.
export const BOOKINGS_DDL = /* sql */ `
  -- A booking belongs to a PERSON at a studio. It used to belong to a
  -- membership, which meant a drop-in — somebody with no membership at all —
  -- could not hold a seat. Who may book is a question for grants and standing,
  -- not for a foreign key.
  CREATE TABLE bookings (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    session_id     TEXT NOT NULL REFERENCES class_sessions(id),
    person_id      TEXT NOT NULL REFERENCES people(id),
    status         TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'waitlisted')),
    booked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Same reason as booked_count: a roster joined to check_ins would be INNER
    -- and drop every booking nobody attended — the people a desk has yet to
    -- check in. The check-in mutation writes both in one transaction.
    attended       BOOLEAN NOT NULL DEFAULT false,

    UNIQUE (session_id, person_id)
  );

  CREATE FUNCTION sync_booked_count() RETURNS TRIGGER AS $sync$
  BEGIN
    UPDATE class_sessions s
    SET booked_count = (SELECT count(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'booked')
    WHERE s.id = COALESCE(NEW.session_id, OLD.session_id);
    RETURN NULL;
  END;
  $sync$ LANGUAGE plpgsql;

  CREATE TRIGGER bookings_sync_count
    AFTER INSERT OR UPDATE OR DELETE ON bookings
    FOR EACH ROW EXECUTE FUNCTION sync_booked_count();

  CREATE FUNCTION enforce_capacity() RETURNS TRIGGER AS $cap$
  DECLARE
    taken    INTEGER;
    room     INTEGER;
    existing RECORD;
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM class_sessions cs WHERE cs.id = NEW.session_id AND cs.studio_id = NEW.studio_id) THEN
      RAISE EXCEPTION 'That class is not on this studio''s timetable.';
    END IF;

    IF NEW.status <> 'booked' THEN RETURN NEW; END IF;

    SELECT count(*) INTO taken FROM bookings b WHERE b.session_id = NEW.session_id AND b.status = 'booked' AND b.id <> NEW.id;
    SELECT capacity INTO room FROM class_sessions WHERE id = NEW.session_id;

    IF TG_OP = 'INSERT' THEN
      SELECT id, status INTO existing FROM bookings
       WHERE session_id = NEW.session_id AND person_id = NEW.person_id;
      IF FOUND THEN
        IF existing.status = 'booked' THEN
          RETURN NULL;
        END IF;
        -- Capacity is re-checked, so a class that filled while they were away
        -- puts them back in the queue rather than into a seat that is gone.
        UPDATE bookings SET status = CASE WHEN taken >= room THEN 'waitlisted' ELSE 'booked' END
         WHERE id = existing.id;
        -- NULL from a BEFORE trigger skips the insert: the row is reused.
        RETURN NULL;
      END IF;
    END IF;

    IF taken >= room THEN
      NEW.status := 'waitlisted';
    END IF;
    RETURN NEW;
  END;
  $cap$ LANGUAGE plpgsql;

  CREATE TRIGGER bookings_enforce_capacity
    BEFORE INSERT OR UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION enforce_capacity();

  CREATE OR REPLACE FUNCTION promote_from_waitlist() RETURNS TRIGGER AS $pro$
  DECLARE
    v_taken INTEGER;
    v_room  INTEGER;
    v_next  TEXT;
  BEGIN
    -- Only when a seat was actually given up.
    IF NOT (OLD.status = 'booked' AND NEW.status <> 'booked') THEN RETURN NULL; END IF;

    SELECT count(*) INTO v_taken FROM bookings WHERE session_id = NEW.session_id AND status = 'booked';
    SELECT capacity INTO v_room FROM class_sessions WHERE id = NEW.session_id;
    IF v_taken >= v_room THEN RETURN NULL; END IF;

    SELECT id INTO v_next FROM bookings
     WHERE session_id = NEW.session_id AND status = 'waitlisted'
     ORDER BY booked_at ASC
     LIMIT 1;

    IF v_next IS NOT NULL THEN
      UPDATE bookings SET status = 'booked' WHERE id = v_next;
      -- The member's mirror follows, or their screen would say "waiting" about
      -- a class they now have a place in.
    END IF;
    RETURN NULL;
  END;
  $pro$ LANGUAGE plpgsql;

  CREATE TRIGGER bookings_promote_waitlist
    AFTER UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION promote_from_waitlist();

  CREATE TABLE check_ins (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    person_id      TEXT NOT NULL REFERENCES people(id),
    session_id     TEXT REFERENCES class_sessions(id),
    -- The clock lives in the database, not the write: a check-in carries who and
    -- which class, so WHEN cannot be forged or back-dated.
    happened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    held_on        DATE NOT NULL,
    hour_key       INTEGER NOT NULL DEFAULT EXTRACT(HOUR FROM now()),
    method         TEXT NOT NULL DEFAULT 'desk' CHECK (method IN ('desk', 'kiosk', 'app'))
  );

  CREATE OR REPLACE FUNCTION stamp_check_ins_held_on() RETURNS TRIGGER AS $stampcheck_ins$
  BEGIN
    IF NEW.held_on IS NULL THEN NEW.held_on := studio_today(NEW.studio_id); END IF;
    RETURN NEW;
  END;
  $stampcheck_ins$ LANGUAGE plpgsql;

  CREATE TRIGGER check_ins_stamp_held_on
    BEFORE INSERT ON check_ins
    FOR EACH ROW EXECUTE FUNCTION stamp_check_ins_held_on();

  -- Attendance is what spends a pass credit — see spend_pass_credit() in
  -- passes.ts, which is where the drawdown rule lives.
  CREATE TRIGGER check_ins_spend_pass
    AFTER INSERT ON check_ins
    FOR EACH ROW EXECUTE FUNCTION spend_pass_credit();

  CREATE INDEX bookings_session  ON bookings (session_id, status);
  CREATE INDEX bookings_person   ON bookings (person_id, status);
  CREATE INDEX check_ins_studio  ON check_ins (studio_id, held_on);
  CREATE INDEX check_ins_person  ON check_ins (person_id, held_on);
`;

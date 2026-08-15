// The timetable: a recurring slot, the sessions it generates, and the
// denormalised facts vex cannot join its way to.
export const CLASSES_DDL = /* sql */ `
  CREATE TABLE class_templates (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    program_id     TEXT NOT NULL REFERENCES programs(id),
    name           TEXT NOT NULL,
    weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    -- TEXT rather than TIME because vex selects columns without casting, so a
    -- TIME reaches every screen as '18:00:00'. The CHECK is what buys what TIME
    -- would: always valid, and zero-padded so it sorts in clock order.
    starts_at      TEXT NOT NULL CHECK (starts_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    duration_mins  INTEGER NOT NULL DEFAULT 60 CHECK (duration_mins > 0),
    capacity       INTEGER NOT NULL DEFAULT 20 CHECK (capacity >= 0),
    instructor_id  TEXT REFERENCES staff(id),

    -- Bounded recurrence. Both NULL is an ongoing class; both set is a block.
    starts_on      DATE,
    ends_on        DATE,

    course_id      TEXT REFERENCES courses(id),

    -- Denormalised, because it is a join vex cannot make: instructor_id is
    -- nullable so staff LEFT-joins, but staff.person_id is NOT NULL so people
    -- INNER-joins, and the chain drops every slot with nobody assigned.
    instructor_name TEXT NOT NULL DEFAULT 'Unassigned',

    active         BOOLEAN NOT NULL DEFAULT true
  );

  CREATE TABLE class_sessions (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    -- NULLABLE, and that is what makes a one-off possible: a workshop is a
    -- session with no recurring rule behind it.
    template_id    TEXT REFERENCES class_templates(id),
    program_id     TEXT NOT NULL REFERENCES programs(id),
    name           TEXT NOT NULL,
    held_on        DATE NOT NULL,
    starts_at      TEXT NOT NULL CHECK (starts_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    duration_mins  INTEGER NOT NULL DEFAULT 60,
    capacity       INTEGER NOT NULL DEFAULT 20,
    instructor_id  TEXT REFERENCES staff(id),
    status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
    week_key       TEXT NOT NULL,          -- '2026-W32', for grouping
    hour_key       INTEGER NOT NULL,       -- 0..23, for peak-hour reporting

    -- A counter cache, because vex only LEFT-joins nullable foreign keys: a
    -- sessions x bookings join is INNER and drops every class nobody has booked.
    -- Maintained by TRIGGER — "booked_count + 1" is not expressible in the
    -- mutation grammar, and a counter its writers maintain drifts.
    booked_count   INTEGER NOT NULL DEFAULT 0
  );

  CREATE OR REPLACE FUNCTION derive_session_buckets() RETURNS TRIGGER AS $buk$
  BEGIN
    IF NEW.week_key IS NULL OR NEW.week_key = '' THEN
      NEW.week_key := to_char(NEW.held_on, 'IYYY"-W"IW');
    END IF;
    IF NEW.hour_key IS NULL THEN
      NEW.hour_key := split_part(NEW.starts_at, ':', 1)::int;
    END IF;
    RETURN NEW;
  END;
  $buk$ LANGUAGE plpgsql;

  CREATE TRIGGER sessions_derive_buckets
    BEFORE INSERT OR UPDATE ON class_sessions
    FOR EACH ROW EXECUTE FUNCTION derive_session_buckets();

  CREATE FUNCTION generate_sessions() RETURNS TRIGGER AS $gen$
  BEGIN
    DELETE FROM class_sessions s
    WHERE s.template_id = NEW.id
      AND s.held_on > studio_today(NEW.studio_id)
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = s.id);

    IF NEW.active THEN
      INSERT INTO class_sessions
        (id, studio_id, template_id, program_id, name, held_on, starts_at, duration_mins, capacity, instructor_id, status, week_key, hour_key)
      SELECT
        NEW.id || ':' || to_char(gs.d, 'YYYYMMDD'),
        NEW.studio_id, NEW.id, NEW.program_id, NEW.name,
        gs.d::date, NEW.starts_at, NEW.duration_mins, NEW.capacity, NEW.instructor_id,
        'scheduled',
        to_char(gs.d, 'IYYY"-W"IW'),
        split_part(NEW.starts_at, ':', 1)::int
      FROM generate_series(
        GREATEST(studio_today(NEW.studio_id) + 1, COALESCE(NEW.starts_on, studio_today(NEW.studio_id) + 1)),
        COALESCE(NEW.ends_on, studio_today(NEW.studio_id) + 28),
        '1 day'::interval
      ) AS gs(d)
      WHERE EXTRACT(DOW FROM gs.d) = NEW.weekday
      ON CONFLICT (id) DO NOTHING;
    END IF;

    RETURN NULL;
  END;
  $gen$ LANGUAGE plpgsql;

  -- Keep the denormalised teacher name true, from both ends: when a slot is
  -- written, and when somebody is renamed.
  CREATE FUNCTION sync_instructor_name() RETURNS TRIGGER AS $who$
  BEGIN
    NEW.instructor_name := COALESCE(
      (SELECT p.name FROM staff s JOIN people p ON p.id = s.person_id WHERE s.id = NEW.instructor_id),
      'Unassigned'
    );
    RETURN NEW;
  END;
  $who$ LANGUAGE plpgsql;

  CREATE TRIGGER templates_sync_instructor_name
    BEFORE INSERT OR UPDATE ON class_templates
    FOR EACH ROW EXECUTE FUNCTION sync_instructor_name();

  CREATE FUNCTION resync_instructor_names() RETURNS TRIGGER AS $ren$
  BEGIN
    UPDATE class_templates t SET instructor_name = NEW.name
    WHERE t.instructor_id IN (SELECT s.id FROM staff s WHERE s.person_id = NEW.id);
    RETURN NULL;
  END;
  $ren$ LANGUAGE plpgsql;

  CREATE TRIGGER people_resync_instructor_names
    AFTER UPDATE OF name ON people
    FOR EACH ROW EXECUTE FUNCTION resync_instructor_names();

  CREATE TRIGGER templates_generate_sessions
    AFTER INSERT OR UPDATE ON class_templates
    FOR EACH ROW EXECUTE FUNCTION generate_sessions();

  CREATE INDEX templates_studio  ON class_templates (studio_id, active);
  CREATE INDEX templates_course  ON class_templates (course_id);
  CREATE INDEX sessions_studio_day ON class_sessions (studio_id, held_on);
  CREATE INDEX sessions_template   ON class_sessions (template_id, held_on);
`;

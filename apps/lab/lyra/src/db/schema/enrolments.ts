// Joining a course: a seat in a dated block, and the bookings it fans out to.
export const ENROLMENTS_DDL = /* sql */ `
  -- The third entitlement: a seat in a dated, bounded block. Held by the
  -- person — a course full of beginners is mostly people who are not members.
  CREATE TABLE enrolments (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    course_id      TEXT NOT NULL REFERENCES courses(id),
    person_id      TEXT NOT NULL REFERENCES people(id),
    paid_via       TEXT NOT NULL DEFAULT 'manual' CHECK (paid_via IN ('manual', 'stripe', 'comp', 'free')),
    status         TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'withdrawn')),
    enrolled_on    DATE NOT NULL,
    UNIQUE (course_id, person_id)
  );

  CREATE OR REPLACE FUNCTION stamp_enrolments_enrolled_on() RETURNS TRIGGER AS $stampenrolments$
  BEGIN
    IF NEW.enrolled_on IS NULL THEN NEW.enrolled_on := studio_today(NEW.studio_id); END IF;
    RETURN NEW;
  END;
  $stampenrolments$ LANGUAGE plpgsql;

  CREATE TRIGGER enrolments_stamp_enrolled_on
    BEFORE INSERT ON enrolments
    FOR EACH ROW EXECUTE FUNCTION stamp_enrolments_enrolled_on();

  -- The counter cache, as class_sessions.booked_count states the rule.
  CREATE OR REPLACE FUNCTION sync_enrolled_count() RETURNS TRIGGER AS $ec$
  BEGIN
    UPDATE courses c
       SET enrolled_count = (SELECT count(*) FROM enrolments e WHERE e.course_id = c.id AND e.status = 'enrolled')
     WHERE c.id = COALESCE(NEW.course_id, OLD.course_id);
    RETURN NULL;
  END;
  $ec$ LANGUAGE plpgsql;

  -- Coming back to a block they once withdrew from is the SAME seat: the row
  -- is reused rather than duplicated, and enrolling twice is refused in words
  -- a desk can read out loud.
  CREATE OR REPLACE FUNCTION dedupe_enrolment() RETURNS TRIGGER AS $dep$
  BEGIN
    IF EXISTS (SELECT 1 FROM enrolments WHERE course_id = NEW.course_id AND person_id = NEW.person_id AND status = 'enrolled') THEN
      RAISE EXCEPTION 'They are already on that course.';
    END IF;

    IF EXISTS (SELECT 1 FROM enrolments WHERE course_id = NEW.course_id AND person_id = NEW.person_id) THEN
      UPDATE enrolments SET status = 'enrolled'
       WHERE course_id = NEW.course_id AND person_id = NEW.person_id;
      RETURN NULL;
    END IF;

    RETURN NEW;
  END;
  $dep$ LANGUAGE plpgsql;

  CREATE TRIGGER enrolments_dedupe
    BEFORE INSERT ON enrolments
    FOR EACH ROW EXECUTE FUNCTION dedupe_enrolment();

  CREATE TRIGGER enrolments_sync_count
    AFTER INSERT OR UPDATE OR DELETE ON enrolments
    FOR EACH ROW EXECUTE FUNCTION sync_enrolled_count();

  CREATE OR REPLACE FUNCTION enforce_course_capacity() RETURNS TRIGGER AS $ecap$
  DECLARE
    v_cap  INTEGER;
    v_have INTEGER;
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = NEW.course_id AND c.studio_id = NEW.studio_id AND c.active) THEN
      RAISE EXCEPTION 'That course is not open at this studio.';
    END IF;

    IF NEW.status <> 'enrolled' THEN RETURN NEW; END IF;
    SELECT capacity INTO v_cap FROM courses WHERE id = NEW.course_id;
    SELECT count(*) INTO v_have FROM enrolments WHERE course_id = NEW.course_id AND status = 'enrolled' AND id <> NEW.id;
    IF v_have >= v_cap THEN
      RAISE EXCEPTION 'This course is full.';
    END IF;
    RETURN NEW;
  END;
  $ecap$ LANGUAGE plpgsql;

  CREATE TRIGGER enrolments_enforce_capacity
    BEFORE INSERT OR UPDATE ON enrolments
    FOR EACH ROW EXECUTE FUNCTION enforce_course_capacity();

  CREATE OR REPLACE FUNCTION fan_out_enrolment() RETURNS TRIGGER AS $fan$
  BEGIN
    IF NEW.status = 'enrolled' THEN
      INSERT INTO bookings (studio_id, session_id, person_id, status)
      SELECT NEW.studio_id, cs.id, NEW.person_id, 'booked'
        FROM class_sessions cs
        JOIN class_templates ct ON ct.id = cs.template_id
       WHERE ct.course_id = NEW.course_id
         AND cs.status = 'scheduled'
         AND cs.held_on >= studio_today(NEW.studio_id)
      ON CONFLICT (session_id, person_id) DO UPDATE SET status = 'booked';
    ELSE
      UPDATE bookings b SET status = 'cancelled'
       WHERE b.person_id = NEW.person_id
         AND b.session_id IN (
           SELECT cs.id FROM class_sessions cs
             JOIN class_templates ct ON ct.id = cs.template_id
            WHERE ct.course_id = NEW.course_id AND cs.held_on >= studio_today(NEW.studio_id)
         );
    END IF;
    RETURN NULL;
  END;
  $fan$ LANGUAGE plpgsql;

  CREATE TRIGGER enrolments_fan_out
    AFTER INSERT OR UPDATE ON enrolments
    FOR EACH ROW EXECUTE FUNCTION fan_out_enrolment();

  -- The anchor's mirrors follow every move — see resync_relationships_row in
  -- people.ts.
  CREATE TRIGGER enrolments_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON enrolments
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();

  CREATE INDEX enrolments_course ON enrolments (course_id, status);
  CREATE INDEX enrolments_person ON enrolments (person_id, status);
`;

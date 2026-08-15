// What happens at the studio: a program, and a course as a dated block of it.
export const PROGRAMS_DDL = /* sql */ `
  CREATE TABLE programs (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    name        TEXT NOT NULL,
    blurb       TEXT NOT NULL DEFAULT '',
    colour      TEXT NOT NULL DEFAULT 'indigo' CHECK (colour IN ('rose', 'amber', 'lime', 'emerald', 'teal', 'sky', 'indigo', 'violet', 'fuchsia', 'stone')),
    active      BOOLEAN NOT NULL DEFAULT true
  );

  CREATE TABLE courses (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    program_id     TEXT NOT NULL REFERENCES programs(id),
    name           TEXT NOT NULL,
    blurb          TEXT NOT NULL DEFAULT '',
    starts_on      DATE NOT NULL,
    ends_on        DATE NOT NULL,
    capacity       INTEGER NOT NULL DEFAULT 12,
    price_cents    INTEGER NOT NULL DEFAULT 0,
    -- A block has a price, so a block has a currency — the pair target, as a
    -- plan carries it. Every table holding money names what the money is, so no
    -- read has to infer it from a constraint holding somewhere else.
    currency       TEXT NOT NULL DEFAULT 'EUR',
    active         BOOLEAN NOT NULL DEFAULT true,

    enrolled_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (studio_id, currency) REFERENCES studios (id, currency)
  );

  -- A course whose dates move drags every enrolled person's horizon with it.
  CREATE OR REPLACE FUNCTION resync_course_cohort() RETURNS TRIGGER AS $cohort$
  DECLARE
    who RECORD;
  BEGIN
    FOR who IN SELECT e.studio_id, e.person_id FROM enrolments e WHERE e.course_id = NEW.id LOOP
      PERFORM resync_relationships(who.studio_id, who.person_id);
    END LOOP;
    RETURN NULL;
  END;
  $cohort$ LANGUAGE plpgsql;

  CREATE TRIGGER courses_resync_cohort
    AFTER UPDATE OF ends_on ON courses
    FOR EACH ROW EXECUTE FUNCTION resync_course_cohort();

  CREATE INDEX courses_studio ON courses (studio_id, active);
`;

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
    -- ── WHAT IT COSTS, AND IT IS NOT A COLUMN HERE ───────────
    --
    -- A block used to carry price_cents and its own currency, which made
    -- courses a second price list: two tables answering "what can somebody pay
    -- for at this studio", two screens authoring them, and every catalogue
    -- reader — the checkout, the processor, the store that is coming — having to
    -- know the split. The block keeps everything that is a BLOCK; the price is
    -- an offerings row of kind 'course', and there is one catalogue again.
    --
    -- NOT NULL, so there is no half-priced state to read around: a block without
    -- a price was never sellable, and writing one is two statements that agree
    -- about an id rather than a column somebody can forget. The currency goes
    -- with the price — one studio, one currency, stated once over there.
    --
    -- UNIQUE, because a price row belongs to the block that named it. Two blocks
    -- sharing one is two blocks that reprice each other.
    offering_id    TEXT NOT NULL UNIQUE,
    active         BOOLEAN NOT NULL DEFAULT true,

    enrolled_count INTEGER NOT NULL DEFAULT 0,
    -- The pair rule the whole schema carries: a block cannot name another
    -- studio's price, however the id arrived.
    FOREIGN KEY (offering_id, studio_id) REFERENCES offerings (id, studio_id)
  );

  -- AND THAT PRICE IS A COURSE PRICE. The same rule, and the same reason, as
  -- offerings.check_joining_fee: a CHECK cannot see another row, and a block
  -- pointing at a membership would put a recurring subscription on a checkout
  -- for a six-week block.
  CREATE OR REPLACE FUNCTION check_course_offering() RETURNS TRIGGER AS $cco$
  DECLARE
    priced_as TEXT;
  BEGIN
    SELECT kind INTO priced_as FROM offerings WHERE id = NEW.offering_id;
    IF priced_as <> 'course' THEN
      RAISE EXCEPTION 'a course must be priced by a course offering, not a %', COALESCE(priced_as, 'missing offering');
    END IF;
    RETURN NEW;
  END;
  $cco$ LANGUAGE plpgsql;

  CREATE TRIGGER courses_check_offering
    BEFORE INSERT OR UPDATE OF offering_id ON courses
    FOR EACH ROW EXECUTE FUNCTION check_course_offering();

  -- And a block holds its price, so the studio cannot delete that row out from
  -- under it — see offerings.held_count.
  CREATE TRIGGER courses_sync_offering_holds
    AFTER INSERT OR UPDATE OF offering_id OR DELETE ON courses
    FOR EACH ROW EXECUTE FUNCTION sync_offering_holds_of_row();

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

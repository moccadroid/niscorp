// People, the sign-in link, and the anchor that says a human is known to a
// studio — plus the recompute every relationship table lands on.
export const PEOPLE_DDL = /* sql */ `
  -- A human. Deliberately thin: a person is not a member and not staff and not
  -- a lead — they HOLD relationships to a studio, plural and concurrent. Email
  -- is the login identity (magic link).
  CREATE TABLE people (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ── the sign-in link ────────────────────────────────────────
  --
  -- ONE ROW PER LINK, AND THE ROW IS THE CREDENTIAL.
  --
  -- The link used to carry a session token: "?token=" went straight into
  -- localStorage (main.tsx), so the thing in somebody's inbox WAS the session,
  -- forever, for whoever read the mail. This holds a 256-bit random nonce
  -- instead, and redeeming it TRADES it for a session.
  --
  -- No signature, deliberately. A signed stateless token still needs a row to
  -- be single-use, and once there is a row the signature proves nothing the
  -- lookup does not: an unguessable value either matches a live row or it does
  -- not. One mechanism, no secret to rotate.
  --
  -- Redeeming DELETES, in the same statement that reads. That is what makes it
  -- single-use rather than "single-use unless two requests arrive together".
  CREATE TABLE login_links (
    nonce      TEXT PRIMARY KEY,
    person_id  TEXT NOT NULL REFERENCES people(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ── the anchor ──────────────────────────────────────────────
  --
  -- THIS HUMAN IS KNOWN TO THIS STUDIO, independent of any single engagement.
  -- The prospect who asked yesterday, the member of nine years, the mat
  -- supplier and the physio the desk refers to all get exactly this row —
  -- what DIFFERS about them is derived from the relationships they hold
  -- (subscriptions, passes, enrolments, staff, contact tags), never stored
  -- as a category. The old schema forced every human into exactly one of
  -- member | lead | staff | connection, which made "enquiries" a membership
  -- that wasn't one and made the milkman unrepresentable. See standing.ts for
  -- the derivation.
  --
  -- Carries what belongs to the RELATIONSHIP rather than to any product:
  -- where they came from, when they first appeared, the studio's notes, and
  -- the free-trial window (a trial is a courtesy the studio extends to a
  -- PERSON — it exists before any entitlement does, which is why it cannot
  -- live on a subscription).
  CREATE TABLE studio_people (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id     TEXT NOT NULL REFERENCES studios(id),
    person_id     TEXT NOT NULL REFERENCES people(id),
    source        TEXT NOT NULL DEFAULT 'walk-in' CHECK (source IN ('walk-in', 'website', 'referral', 'social', 'event', 'other')),
    -- The day the studio first knew them — the day they asked, walked in, or
    -- were written down. Stamped by the studio's own clock below.
    first_seen_on DATE NOT NULL,
    -- A trial is a DATE, not a status: NULL means none, a date means the free
    -- window closes on its own with nothing running. See standing.ts.
    trial_ends_on DATE,
    notes         TEXT NOT NULL DEFAULT '',
    -- CONSENT TO BE MARKETED AT, held on the ANCHOR because it is given to a
    -- studio and not to Lyra: the same human may want one studio's news and not
    -- another's, and a flag on the person could not say so. Default false, which
    -- means "somebody stops coming" reaches nobody until a studio has actually
    -- asked — correct, and a surprise to anybody who did not read for it.
    -- A class reminder is not marketing; see the moment's own marketing flag.
    marketing_ok  BOOLEAN NOT NULL DEFAULT false,

    -- ── THE RELATIONSHIP MIRRORS ─────────────────────────────
    --
    -- Counter caches, kept by the database like every other one here
    -- (booked_count, enrolled_count): counts and HORIZON DATES from the
    -- entitlement tables, resynced by triggers whenever those rows move.
    -- They exist so the roll can derive standing from the anchor row alone —
    -- a desk may know somebody holds a live subscription without holding the
    -- grant that reads what anybody pays, and the access model needs no new
    -- vocabulary to say so.
    --
    -- NO CONCLUSION IS STORED. These are counts and dates, compared against
    -- the studio's own day at read (standing.ts) — the paid_until doctrine:
    -- a stored "is live" would be wrong for the whole of the day it lapsed;
    -- a stored "live until the 14th" cannot rot, because which rows carry
    -- credits changes only at writes, and writes resync.
    active_subscriptions INTEGER NOT NULL DEFAULT 0,
    paused_subscriptions INTEGER NOT NULL DEFAULT 0,
    held_subscriptions   INTEGER NOT NULL DEFAULT 0,
    held_passes          INTEGER NOT NULL DEFAULT 0,
    held_enrolments      INTEGER NOT NULL DEFAULT 0,
    -- The last day on which at least one pass with credits left is valid
    -- (9999-12-31 for a pass that never expires). NULL = no credited pass.
    pass_live_until      DATE,
    -- The last day of the latest block they are enrolled on. NULL = none.
    enrolled_until       DATE,
    works_here           BOOLEAN NOT NULL DEFAULT false,
    deals_here           BOOLEAN NOT NULL DEFAULT false,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (studio_id, person_id)
  );

  -- One resync, called from every table a relationship lives in. Recomputes
  -- rather than increments — "counter + 1" drifts the first time two triggers
  -- race, and a recompute is one indexed count per column.
  -- plpgsql rather than sql, so the body is not validated against tables the
  -- DDL has not reached yet — it only ever RUNS after everything exists.
  CREATE OR REPLACE FUNCTION resync_relationships(p_studio TEXT, p_person TEXT) RETURNS void AS $rel$
  BEGIN
    UPDATE studio_people sp SET
      active_subscriptions = (SELECT count(*) FROM subscriptions s WHERE s.studio_id = p_studio AND s.person_id = p_person AND s.status = 'active'),
      paused_subscriptions = (SELECT count(*) FROM subscriptions s WHERE s.studio_id = p_studio AND s.person_id = p_person AND s.status = 'paused'),
      held_subscriptions   = (SELECT count(*) FROM subscriptions s WHERE s.studio_id = p_studio AND s.person_id = p_person),
      held_passes          = (SELECT count(*) FROM passes p WHERE p.studio_id = p_studio AND p.person_id = p_person),
      held_enrolments      = (SELECT count(*) FROM enrolments e WHERE e.studio_id = p_studio AND e.person_id = p_person),
      pass_live_until      = (SELECT MAX(COALESCE(p.expires_on, DATE '9999-12-31')) FROM passes p
                               WHERE p.studio_id = p_studio AND p.person_id = p_person
                                 AND p.status = 'active' AND p.credits_used < p.credits_total),
      enrolled_until       = (SELECT MAX(c.ends_on) FROM enrolments e JOIN courses c ON c.id = e.course_id
                               WHERE e.studio_id = p_studio AND e.person_id = p_person AND e.status = 'enrolled'),
      works_here           = EXISTS (SELECT 1 FROM staff st WHERE st.studio_id = p_studio AND st.person_id = p_person AND st.active),
      deals_here           = EXISTS (SELECT 1 FROM connections c WHERE c.studio_id = p_studio AND c.person_id = p_person AND c.active)
    WHERE sp.studio_id = p_studio AND sp.person_id = p_person;
  END;
  $rel$ LANGUAGE plpgsql;

  -- The per-table shim: resync whoever the moved row belongs to (NEW and OLD,
  -- for the day a row is ever re-pointed). A person with no anchor resyncs
  -- nothing, which is correct — the anchor IS the relationship, and its own
  -- INSERT trigger below picks everything up whenever it arrives.
  --
  -- Anything that moves a relationship row — a start, an assert, a pause
  -- applying, a credit spent, a withdrawal, a hire, a tag — lands here. The
  -- trigger that carries it is created in each relationship table's own
  -- fragment, because a trigger names a real table and this function does not.
  CREATE OR REPLACE FUNCTION resync_relationships_row() RETURNS TRIGGER AS $relrow$
  BEGIN
    IF TG_OP <> 'DELETE' THEN PERFORM resync_relationships(NEW.studio_id, NEW.person_id); END IF;
    IF TG_OP = 'DELETE' THEN
      PERFORM resync_relationships(OLD.studio_id, OLD.person_id);
    ELSIF TG_OP = 'UPDATE' AND (OLD.person_id <> NEW.person_id OR OLD.studio_id <> NEW.studio_id) THEN
      PERFORM resync_relationships(OLD.studio_id, OLD.person_id);
    END IF;
    RETURN NULL;
  END;
  $relrow$ LANGUAGE plpgsql;

  -- A fresh anchor computes its own mirrors, so nothing depends on which
  -- table was written first — staff hired before they ever trained, a
  -- returning member re-anchored after an export, a seed in any order.
  CREATE OR REPLACE FUNCTION resync_new_anchor() RETURNS TRIGGER AS $anchor$
  BEGIN
    PERFORM resync_relationships(NEW.studio_id, NEW.person_id);
    RETURN NULL;
  END;
  $anchor$ LANGUAGE plpgsql;

  CREATE TRIGGER studio_people_resync
    AFTER INSERT ON studio_people
    FOR EACH ROW EXECUTE FUNCTION resync_new_anchor();

  CREATE OR REPLACE FUNCTION stamp_first_seen() RETURNS TRIGGER AS $stampknown$
  BEGIN
    IF NEW.first_seen_on IS NULL THEN NEW.first_seen_on := studio_today(NEW.studio_id); END IF;
    RETURN NEW;
  END;
  $stampknown$ LANGUAGE plpgsql;

  CREATE TRIGGER studio_people_stamp_first_seen
    BEFORE INSERT ON studio_people
    FOR EACH ROW EXECUTE FUNCTION stamp_first_seen();

  CREATE INDEX studio_people_studio ON studio_people (studio_id);
  CREATE INDEX studio_people_person ON studio_people (person_id);

  -- ─── everybody else ─────────────────────────────────────────
  CREATE TABLE connections (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    person_id   TEXT NOT NULL REFERENCES people(id),
    kind        TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('supplier', 'professional', 'guardian', 'guest', 'other')),
    company     TEXT NOT NULL DEFAULT '',
    notes       TEXT NOT NULL DEFAULT '',
    active      BOOLEAN NOT NULL DEFAULT true,
    created_on  DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE (studio_id, person_id, kind)
  );

  CREATE TRIGGER connections_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON connections
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();

  -- Who works here, and as what. A person can be staff at a studio and hold a
  -- membership there too — an instructor who also trains.
  CREATE TABLE staff (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    person_id   TEXT NOT NULL REFERENCES people(id),
    role        TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'instructor', 'desk', 'automation')),
    active      BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (studio_id, person_id)
  );

  CREATE TRIGGER staff_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON staff
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();

  CREATE INDEX staff_studio ON staff (studio_id, active);
`;

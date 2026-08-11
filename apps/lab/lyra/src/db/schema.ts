// Lyra's Postgres schema, run once against PGlite at boot.
//
// One deployment, many studios. Every table that holds a studio's data carries
// `studio_id`, and that column is the tenant boundary — the scope behaviors in
// `app/vex/behaviors.ts` pin every read and every write to the caller's studio,
// engine-side. A query author cannot opt out of it and a request cannot forge
// it.
//
// Two splits are deliberate and worth reading before the rest:
//
//   PERSON vs MEMBERSHIP — a person is a human (name, email). A membership is
//   that human's relationship with one studio. v1 says one studio per account
//   (PLAN.md), so today it is one-to-one in practice; keeping them apart is
//   what makes "one login, two studios" a later feature rather than a rewrite.
//
//   TEMPLATE vs SESSION — "Tuesday 18:00 Vinyasa" is a recurring rule.
//   "Tuesday 3 March 18:00 Vinyasa" is a bookable thing with a capacity and a
//   roster. Conflating them makes cancelling one class, or moving it, painful
//   forever. Sessions are generated from templates; bookings hang off sessions.
//
// Vex introspects this DDL to compile the authored queries, so the foreign keys
// are load-bearing, not decoration.

export const DDL = /* sql */ `
  -- ─── the look ───────────────────────────────────────────────

  -- A theme is two independent axes (PLAN.md): SURFACE — a token set, applied
  -- as CSS custom properties — and STRUCTURE — replacement layouts keyed by
  -- action id, in "theme_layouts".
  --
  -- Both are partial. A theme that only sets tokens is a valid theme; so is
  -- one that replaces three layouts and no colours. Absent either, the stock
  -- app stands.
  CREATE TABLE themes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    tokens      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- One replacement layout, for one action, under one theme. The layout is a
  -- nova LayoutNode as JSON; it is parsed against the layout schema before it
  -- is ever stored, and checked against the registry before it is served.
  -- If it cannot be used, the action's own default stands — per action, not
  -- per theme (PLAN.md records why).
  CREATE TABLE theme_layouts (
    id          TEXT PRIMARY KEY,
    theme_id    TEXT NOT NULL REFERENCES themes(id),
    action_id   TEXT NOT NULL,
    layout      JSONB NOT NULL,
    UNIQUE (theme_id, action_id)
  );

  -- ─── the tenant ─────────────────────────────────────────────

  -- A studio. "theme" names the row in "themes" this studio wears; NULL means
  -- the stock look. "slug" is what a future public URL would use.
  CREATE TABLE studios (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL,            -- yoga | bjj | dance | pilates | gym | ...
    timezone    TEXT NOT NULL DEFAULT 'UTC',
    theme_id    TEXT REFERENCES themes(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ═══════════════════════════════════════════════════════════
  -- ONE CLOCK, AND IT BELONGS TO THE STUDIO.
  --
  -- There were three. Postgres CURRENT_DATE — the SERVER's day — decided what
  -- a trigger thought "future" meant and how far ahead to generate classes. A
  -- JS-derived value decided what a screen asked for. And tide carried its own
  -- logical now. The first two agreed until a UTC boundary fell between them,
  -- and then a class seeded "today" was invisible to a screen asking for today,
  -- silently, with every check still green.
  --
  -- Neither of those two was ever right. A studio in Auckland has a Tuesday
  -- that starts thirteen hours before the server's, and "tomorrow's classes"
  -- means tomorrow THERE. The timezone column above has been the authority for
  -- automations since tide was wired; this makes it the authority for
  -- everything else too.
  --
  -- STABLE, not IMMUTABLE: it reads now(). Stable is what lets Postgres call it
  -- once per statement, which is also what makes it safe inside a trigger — the
  -- day cannot change halfway through generating a term of classes.
  --
  -- tide's logical now stays injectable, and that is not a fourth clock: it is
  -- this one with an override, which is what lets a check march time forward
  -- and get the answers the real thing would.
  CREATE FUNCTION studio_today(studio TEXT) RETURNS DATE AS $tz$
    SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM studios WHERE id = studio), 'UTC'))::date;
  $tz$ LANGUAGE sql STABLE;

  -- ─── people ─────────────────────────────────────────────────

  -- A human. Deliberately thin: a person is not a member and not staff, they
  -- HAVE a membership or a staff row. Email is the login identity (magic link).
  CREATE TABLE people (
    id          TEXT PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- A person's relationship with one studio. Status is the lifecycle every
  -- membership screen reads: a trialling member and a lapsed one are the same
  -- row at different times, never different tables.
  CREATE TABLE memberships (
    id          TEXT PRIMARY KEY,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    person_id   TEXT NOT NULL REFERENCES people(id),
    -- AN ENQUIRY IS THIS ROW AT STAGE ZERO.
    --
    -- There used to be a "leads" table carrying its own name, email and phone
    -- — a second, shadow person — with a nullable person_id "set when they
    -- become a member" that nothing ever wrote. So a prospect who joined was
    -- typed twice, their enquiry never reached their record, and the question
    -- the column existed for ("how many of last month's enquiries signed")
    -- could not be answered.
    --
    -- The comment three lines below already had the answer: a trialling member
    -- and a lapsed one are the same row at different times. An enquiry is the
    -- same row one step earlier. Converting is now a status change — no new
    -- person, nothing retyped, and the enquiry stays attached to the human
    -- forever. Relay reached the same shape from the other side: its pipeline
    -- lives on the DEAL, never on the contact.
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('enquired', 'trialling', 'active', 'paused', 'lapsed', 'cancelled')),
    -- WHERE THEY CAME FROM, which is the only reason to track an enquiry at
    -- all: a studio that cannot say which channel produced its members is
    -- guessing where to spend. Kept after they join, so the answer survives
    -- the conversion.
    source      TEXT NOT NULL DEFAULT 'walk-in' CHECK (source IN ('walk-in', 'website', 'referral', 'social', 'event', 'other')),
    -- The day the relationship started — the day they asked, for an enquiry.
    joined_on   DATE NOT NULL,
    ended_on    DATE,
    notes       TEXT NOT NULL DEFAULT '',
    UNIQUE (studio_id, person_id)
  );

  -- ─── everybody else ─────────────────────────────────────────
  --
  -- The third verb. A studio's world is not only people who TRAIN here
  -- (memberships) and people who WORK here (staff) — it is also the people it
  -- DEALS with: the mat cleaner, the landlord, the physio it refers to, a
  -- guest instructor for one seminar, the parent who pays for a child.
  --
  -- Those relationships are genuinely thin — a kind, a company, a note — which
  -- is why they share one table where memberships and staff each earned their
  -- own. If one ever grows a lifecycle, that is the signal it deserves its own
  -- table, not a status column bolted on here.
  --
  -- The PERSON is still a person: same people row, same directory, same
  -- search. That is the whole point — the milkman who later signs up is not a
  -- new human, he is a human who gained a membership.
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

  -- Who works here, and as what. A person can be staff at a studio and hold a
  -- membership there too — an instructor who also trains.
  CREATE TABLE staff (
    id          TEXT PRIMARY KEY,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    person_id   TEXT NOT NULL REFERENCES people(id),
    -- The four the charter defines, plus the automation principal. A fifth
    -- role here would resolve to no grants at all — the charter is the ceiling,
    -- and this is the floor agreeing with it.
    role        TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'instructor', 'desk', 'automation')),
    active      BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (studio_id, person_id)
  );

  -- ─── what a membership costs ────────────────────────────────

  -- v1 plans are simple on purpose: one price, one interval, one allowance.
  -- Packs and punch-cards arrive when a customer asks (PLAN.md).
  -- "class_allowance" NULL means unlimited.
  CREATE TABLE plans (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id        TEXT NOT NULL REFERENCES studios(id),
    name             TEXT NOT NULL,
    price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
    currency         TEXT NOT NULL DEFAULT 'EUR',
    interval         TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
    class_allowance  INTEGER,
    active           BOOLEAN NOT NULL DEFAULT true,
    -- WHAT A PLAN COMMITS SOMEBODY TO, which is most of what a plan IS.
    --
    -- A price and an interval describe a subscription nobody is bound by, and
    -- almost no studio sells that: "twelve months, one month's notice" and
    -- "rolling, cancel any time" are different products at the same price, and
    -- the difference is the entire forecast. Revenue inside a minimum term is
    -- money the studio HAS; revenue outside one is money it hopes for.
    minimum_term_months INTEGER NOT NULL DEFAULT 0 CHECK (minimum_term_months >= 0),
    -- How long before leaving takes effect. Notice given today on 30 days ends
    -- the subscription next month, not tonight — so it is still revenue.
    notice_days         INTEGER NOT NULL DEFAULT 0 CHECK (notice_days >= 0)
  );

  -- A membership on a plan, over a period. No payment rows in v1 — money is
  -- deliberately out (PLAN.md) — but the subscription is what billing will
  -- read when it arrives, so it exists now.
  CREATE TABLE subscriptions (
    id             TEXT PRIMARY KEY,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    membership_id  TEXT NOT NULL REFERENCES memberships(id),
    plan_id        TEXT NOT NULL REFERENCES plans(id),
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    started_on     DATE NOT NULL,
    ends_on        DATE,

    -- ── THE TERMS THIS PERSON WAS SOLD, not the terms on sale today ──
    --
    -- A plan's price changes and the people already on it do not. Every studio
    -- has members paying a rate that has not been offered for three years, and
    -- a forecast that reads the CURRENT price list gets all of them wrong. NULL
    -- means "whatever the plan says" — the common case, and the one that keeps
    -- a price rise from needing a backfill.
    price_cents      INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),

    -- Where the minimum term ends. Stamped from the plan at sign-up, so a later
    -- change to the plan's term does not silently re-commit somebody who
    -- already signed. Revenue up to this date is contracted.
    committed_until  DATE,

    -- When they said they were leaving. The date they actually leave is
    -- "ends_on", derived from this plus the notice period and the commitment —
    -- by a trigger, because four screens can end a subscription and a rule in
    -- four places is wrong in at least one.
    notice_given_on  DATE,

    -- The normalised monthly value, in cents. A yearly plan at €1190 is not
    -- €1190 a month, and the old figure simply EXCLUDED yearly plans from the
    -- total — a studio selling annual memberships saw a number missing its best
    -- customers. Maintained by trigger: the mutation grammar cannot divide.
    monthly_cents    INTEGER NOT NULL DEFAULT 0
  );

  -- WHAT A SUBSCRIPTION IS WORTH, AND UNTIL WHEN.
  --
  -- Three derived facts, one place. Each is arithmetic over a joined row, which
  -- is exactly what a closed mutation grammar cannot say — the same reason
  -- every counter cache here is a trigger.
  CREATE OR REPLACE FUNCTION stamp_subscription_terms() RETURNS TRIGGER AS $sub$
  DECLARE
    p RECORD;
  BEGIN
    SELECT price_cents, interval, minimum_term_months, notice_days INTO p FROM plans WHERE id = NEW.plan_id;

    -- Normalised to a month so intervals can be added together. Integer
    -- division rounds down by a few cents a year; a forecast is not a ledger.
    NEW.monthly_cents := CASE
      WHEN p.interval = 'year' THEN COALESCE(NEW.price_cents, p.price_cents) / 12
      ELSE COALESCE(NEW.price_cents, p.price_cents)
    END;

    -- Stamped once, at sign-up, and never moved by a later plan edit.
    IF NEW.committed_until IS NULL THEN
      NEW.committed_until := NEW.started_on + (p.minimum_term_months || ' months')::interval;
    END IF;

    -- LEAVING IS A DATE, NOT AN EVENT. Notice runs its course, and a commitment
    -- outlives notice given inside it — whichever is later is when they go.
    IF NEW.notice_given_on IS NOT NULL THEN
      NEW.ends_on := GREATEST(NEW.committed_until, NEW.notice_given_on + (p.notice_days || ' days')::interval);
    END IF;

    RETURN NEW;
  END;
  $sub$ LANGUAGE plpgsql;

  CREATE TRIGGER subscriptions_stamp_terms
    BEFORE INSERT OR UPDATE OF plan_id, price_cents, notice_given_on, started_on ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION stamp_subscription_terms();

  -- A price rise reaches everybody who has NOT been given their own rate.
  -- Somebody on a grandfathered price keeps it, which is the whole point of the
  -- override existing.
  CREATE OR REPLACE FUNCTION resync_subscription_value() RETURNS TRIGGER AS $planval$
  BEGIN
    UPDATE subscriptions s
       SET monthly_cents = CASE WHEN NEW.interval = 'year' THEN NEW.price_cents / 12 ELSE NEW.price_cents END
     WHERE s.plan_id = NEW.id AND s.price_cents IS NULL;
    RETURN NULL;
  END;
  $planval$ LANGUAGE plpgsql;

  CREATE TRIGGER plans_resync_value
    AFTER UPDATE OF price_cents, interval ON plans
    FOR EACH ROW EXECUTE FUNCTION resync_subscription_value();

  CREATE INDEX subscriptions_forecast ON subscriptions (studio_id, status, ends_on);

  -- ─── which integrations a studio has bought ─────────────────
  --
  -- REGISTRATION IS PLATFORM-LEVEL; INSTALLATION IS NOT. Pointing the platform
  -- at a service and approving what it may read is ours. Turning one on for a
  -- studio is the studio's, and it is this row.
  --
  -- Without it the charter's 'ext.desk.*' would put every integration on every
  -- studio's front desk the moment one studio bought it: the glob is granted
  -- once, per audience, for the whole deployment. Moss asks the app which are
  -- live for a principal's tenant and drops the rest from the catalog.
  CREATE TABLE studio_integrations (
    studio_id       TEXT NOT NULL REFERENCES studios(id),
    integration_id  TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    installed_on    DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (studio_id, integration_id)
  );

  -- ─── what happens at the studio ─────────────────────────────

  -- A stream of practice: "Adult BJJ", "Vinyasa Flow", "Beginner Ballet".
  -- Programs are how a studio describes itself, and later how a discipline
  -- pack (belts, gradings) attaches to only the programs that want it.
  CREATE TABLE programs (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    name        TEXT NOT NULL,
    blurb       TEXT NOT NULL DEFAULT '',
    -- A HUE name, never a hex and never a status word. The kit resolves exactly
    -- these; anything else renders as the fallback, which looks like a theming
    -- bug rather than the data error it is.
    --
    -- This constraint used to list the STATUS palette — accent, calm, warm,
    -- alert, good, neutral — so the database itself agreed that a class type
    -- could be an emergency. A stream is an identity; the ten names below are
    -- colours and nothing else.
    colour      TEXT NOT NULL DEFAULT 'indigo' CHECK (colour IN ('rose', 'amber', 'lime', 'emerald', 'teal', 'sky', 'indigo', 'violet', 'fuchsia', 'stone')),
    active      BOOLEAN NOT NULL DEFAULT true
  );

  -- ─── a course ───────────────────────────────────────────────
  --
  -- A PROGRAM IS A TAXONOMY. A COURSE IS A DATED THING YOU CAN JOIN.
  --
  -- That distinction is the one this schema got wrong first, and the tell was
  -- prose: "Six weeks, from nothing. Runs every term." sat in a program's blurb,
  -- where an app cannot read it, a member cannot book it, and nothing keeps it
  -- true when the dates change. A blurb is for a human; a fact belongs in a
  -- column.
  --
  -- So: "Vinyasa Flow" is a program — a name, a colour, a stream that runs
  -- indefinitely. "Foundations, six weeks from 14 September, twelve places" is a
  -- COURSE. Dance schools, kids' classes and beginner blocks sell mostly this
  -- shape, so it is not an edge case dressed up as one.
  --
  -- What makes it different from an ongoing class, and why it needs its own
  -- table rather than a flag:
  --
  --   CAPACITY IS ON THE COURSE, not on each session. Twelve places means
  --   twelve people for the whole block, not twelve per Tuesday.
  --
  --   YOU ENROL ONCE and hold a place in every session. Booking a six-week
  --   course the way a drop-in class is booked would be six taps and no cohort.
  --
  --   IT HAS A PRICE OF ITS OWN. Not charged in v1 — money is deliberately out
  --   (PLAN.md) — but the column exists so a block sale has somewhere to land
  --   rather than being retrofitted through every screen later.
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
    active         BOOLEAN NOT NULL DEFAULT true,

    -- A counter cache, for the same reason class_sessions has one: vex INNER-
    -- joins non-nullable keys, so a courses × enrolments join drops every
    -- course nobody has joined yet — precisely the one still being sold.
    enrolled_count INTEGER NOT NULL DEFAULT 0
  );

  -- The recurring rule. "weekday" is 0=Sunday..6=Saturday, "starts_at" a local
  -- clock time; the studio's timezone turns the pair into a real moment.
  --
  -- A slot with no "starts_on"/"ends_on" recurs indefinitely — an ongoing
  -- class. A slot carrying both recurs only between them, which is what a
  -- course's weeks are. ONE recurrence concept, bounded or not, so a course did
  -- not need a second generator and a second kind of session.
  CREATE TABLE class_templates (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    program_id     TEXT NOT NULL REFERENCES programs(id),
    name           TEXT NOT NULL,
    weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    -- 'HH:MM', 24-hour, enforced.
    --
    -- The type is still TEXT and that is a deliberate stop rather than an
    -- oversight: TIME is the correct type, but vex selects columns without
    -- casting, so a TIME would reach every screen as '18:00:00' and prism has
    -- no substring to trim it back. The value of the change is that a time is
    -- always a valid time and sorts correctly — and a format constraint buys
    -- exactly that, today, without a formatting cascade through fourteen reads.
    starts_at      TEXT NOT NULL CHECK (starts_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    duration_mins  INTEGER NOT NULL DEFAULT 60 CHECK (duration_mins > 0),
    capacity       INTEGER NOT NULL DEFAULT 20 CHECK (capacity >= 0),
    instructor_id  TEXT REFERENCES staff(id),

    -- Bounded recurrence. Both NULL is an ongoing class; both set is a block.
    starts_on      DATE,
    ends_on        DATE,

    -- The block this slot belongs to, if any. Nullable because most slots are
    -- ordinary weekly classes belonging to nothing — and nullable is also what
    -- lets vex LEFT-join it, so a timetable read does not drop every class that
    -- is not part of a course.
    course_id      TEXT REFERENCES courses(id),

    -- The teacher's NAME, denormalised, and the reason is a join vex cannot
    -- make: "instructor_id" is nullable so staff LEFT-joins, but
    -- "staff.person_id" is NOT NULL so people INNER-joins to staff, and the
    -- chain drops every slot with nobody assigned — precisely the row a manager
    -- is hunting for.
    --
    -- Joining it afterwards in a transform was the other candidate, and it does
    -- not work either: a trigger's "set" step resolves bindings but does not
    -- evaluate Prism ops, so the expression reached the browser unevaluated.
    -- The name therefore lives next to the row, kept true by a trigger.
    instructor_name TEXT NOT NULL DEFAULT 'Unassigned',

    active         BOOLEAN NOT NULL DEFAULT true
  );

  -- One dated occurrence — the thing a person actually books. Generated from a
  -- template, but standalone once it exists: cancelling Tuesday does not touch
  -- the rule, and a one-off workshop has no template at all.
  --
  -- "held_on" + "starts_at" are stored split so the day is groupable without
  -- date functions (vex has none — PLAN.md), and "week_key"/"hour_key" are
  -- denormalised buckets for the same reason: reporting groups on a column.
  -- A dated, bookable class.
  --
  -- "template_id" is NULLABLE, and that is what makes a ONE-OFF possible: a
  -- workshop, a masterclass, a Saturday intensive is simply a session with no
  -- recurring rule behind it. The model has always allowed it; for a long time
  -- nothing could create one, which is a missing screen rather than a missing
  -- concept.
  CREATE TABLE class_sessions (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
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

    -- How many places are taken. A COUNTER CACHE, and the reason is a real
    -- constraint rather than a preference: vex infers joins from foreign keys
    -- and only LEFT-joins nullable ones, so a sessions × bookings join is
    -- INNER and drops every class nobody has booked yet. An empty class is
    -- precisely the one an owner needs to see on Monday morning, so the count
    -- comes off the session row instead of a join.
    --
    -- Maintained by a TRIGGER, not by the writers. The mutation grammar sets
    -- literals and "$context" values, so "booked_count = booked_count + 1" is
    -- not expressible in it — which turned out to be the useful constraint. A
    -- counter every writer has to remember to move is a counter that drifts
    -- the first time somebody adds a fourth way to book; the database owns it,
    -- so it cannot be forgotten and cannot race.
    booked_count   INTEGER NOT NULL DEFAULT 0
  );

  -- A member's place in a session. Cancelled bookings stay as rows: "who
  -- dropped out" is a question every studio owner asks, and deleting the
  -- evidence answers it with silence.
  CREATE TABLE bookings (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    session_id     TEXT NOT NULL REFERENCES class_sessions(id),
    membership_id  TEXT NOT NULL REFERENCES memberships(id),
    status         TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'waitlisted')),
    booked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Did they turn up. A second counter cache, for the same reason as
    -- "booked_count": vex only LEFT-joins nullable foreign keys, so a roster
    -- read joined to check_ins would be INNER and drop every booking nobody
    -- attended — precisely the rows a front desk is looking at, because those
    -- are the people it still has to check in.
    --
    -- MAINTENANCE CONTRACT: the check-in mutation writes the check_in and sets
    -- this in one transaction. "seed-check" recomputes and compares.
    attended       BOOLEAN NOT NULL DEFAULT false,

    UNIQUE (session_id, membership_id)
  );

  -- Turning up. Separate from a booking on purpose: people attend without
  -- booking (walk-ins) and book without attending (no-shows), and a studio
  -- that cannot see the difference cannot see its own retention problem.
  CREATE TABLE check_ins (
    -- Generated by the DATABASE. The mutation grammar sets literals and
    --  values only, so a write cannot mint an id and cannot read one
    -- back — which is why an id a client invents is the alternative, and a
    -- client-invented primary key is a collision waiting for two front desks.
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    membership_id  TEXT NOT NULL REFERENCES memberships(id),
    session_id     TEXT REFERENCES class_sessions(id),
    -- The clock lives in the DATABASE, not in the write. A check-in carries
    -- who and which class; WHEN is not a parameter, so it cannot be forged,
    -- back-dated, or disagree with the defaults on the columns beside it —
    -- the same one-clock rule the seed follows (see db/sql.ts).
    happened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    held_on        DATE NOT NULL,
    hour_key       INTEGER NOT NULL DEFAULT EXTRACT(HOUR FROM now()),
    method         TEXT NOT NULL DEFAULT 'desk' CHECK (method IN ('desk', 'kiosk', 'app'))
  );

  -- ─── invariants the database owns ───────────────────────────
  --
  -- Two things live here rather than in the application, and both are here for
  -- the same reason: the closed mutation grammar cannot express them, and that
  -- is a better answer than an escape hatch.
  --
  -- A counter cache maintained by its writers drifts the first time somebody
  -- adds a fourth way to book. A capacity check performed by reading first and
  -- writing second is a race with a queue of people at the door. Both belong
  -- next to the rows.

  -- The booked figure, recomputed from the bookings themselves. Every path in
  -- and out of a booking moves it, including ones nobody has written yet.
  -- The grouping buckets, derived when a session is written by hand.
  --
  -- "generate_sessions" computes these for every class it makes; a one-off
  -- inserted through a form has nobody to compute them, and they are NOT NULL
  -- because every report groups on them (vex has no date functions). Derived
  -- here so a hand-written session is indistinguishable from a generated one
  -- everywhere downstream.
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

  -- TAKING A PLACE — every rule about it, on the table that holds places.
  --
  -- These lived on "member_bookings", the parallel table a member used to write
  -- through, so they guarded the member's path and nothing else. That table is
  -- gone (reach is the rung's now), and the rules came here — which is where
  -- they belonged, because each is true of a booking however it was made.
  --
  -- Two of them changed meaning by moving, both for the better:
  --
  --   FULL IS A QUEUE, NOT A REFUSAL, and now for the desk as well. Turning
  --   somebody away throws away the one fact a studio most wants — that demand
  --   exceeded the room — and makes them check back by hand. Only the member's
  --   path waitlisted before; a desk booking into a full class got an exception.
  --
  --   BOOKING SOMETHING BOOKED BEFORE reuses the row instead of hitting the
  --   unique index. Also both paths now: a desk re-adding somebody who cancelled
  --   last week used to be shown a constraint name.
  CREATE FUNCTION enforce_capacity() RETURNS TRIGGER AS $cap$
  DECLARE
    taken    INTEGER;
    room     INTEGER;
    existing RECORD;
  BEGIN
    -- THE CLASS HAS TO BE THIS STUDIO'S.
    --
    -- A booking names a session and carries a studio, and nothing in the column
    -- types makes those agree — two foreign keys, each valid alone. The engine
    -- stamps the studio from the caller's scope, so a request naming another
    -- studio's session produced a row pointing at a class that studio does not
    -- teach. The deleted mirror caught this for members only.
    IF NOT EXISTS (SELECT 1 FROM class_sessions cs WHERE cs.id = NEW.session_id AND cs.studio_id = NEW.studio_id) THEN
      RAISE EXCEPTION 'That class is not on this studio''s timetable.';
    END IF;

    IF NEW.status <> 'booked' THEN RETURN NEW; END IF;

    SELECT count(*) INTO taken FROM bookings b WHERE b.session_id = NEW.session_id AND b.status = 'booked' AND b.id <> NEW.id;
    SELECT capacity INTO room FROM class_sessions WHERE id = NEW.session_id;

    IF TG_OP = 'INSERT' THEN
      SELECT id, status INTO existing FROM bookings
       WHERE session_id = NEW.session_id AND membership_id = NEW.membership_id;
      IF FOUND THEN
        -- ALREADY HOLDING IT IS NOT AN ERROR, it is nothing to do.
        --
        -- This raised, which made a double tap a 500 and — worse — made the
        -- course fan-out fail wholesale the moment one of its sessions was
        -- already booked, taking the whole enrolment with it. The upsert it
        -- uses could never reach its ON CONFLICT clause, because a BEFORE
        -- trigger had already thrown.
        --
        -- Idempotent is the honest answer: the row they wanted exists, the
        -- screen shows it booked, and nothing needs saying.
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

  -- Dated classes follow their rule. Adding a Tuesday slot puts Tuesdays on
  -- the timetable; moving it to Wednesday moves the ones nobody has booked yet.
  --
  -- Here for the same reason as the others: generating a term of sessions is a
  -- bulk insert over a date series, which a closed mutation grammar cannot say
  -- and should not learn to. The rule is the authored thing; the occurrences
  -- are derived from it, and derivation belongs next to the rows.
  --
  -- FUTURE and UNBOOKED only. A class somebody has booked into is a commitment,
  -- and a manager who moves a slot has not thereby cancelled next Tuesday on
  -- eleven people — those sessions stay, and the desk can cancel them one at a
  -- time if that is what was meant.
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
      -- BOUNDED RECURRENCE. A slot with no dates runs forever, which is what an
      -- ongoing class is; a slot with dates runs between them, which is what a
      -- course is. One concept, one generator — the alternative was a second
      -- kind of schedule object with its own copy of all of this.
      --
      -- The rolling window is 28 days for an OPEN-ENDED slot, so an ongoing
      -- class keeps four weeks of calendar ahead of it and no more.
      --
      -- A BOUNDED one is generated IN FULL, and the difference matters. A block
      -- is finite and somebody enrols on the whole of it: "six Mondays from
      -- November" has to show six Mondays the moment it exists, not two of them
      -- because the rolling horizon happens to end in three weeks. A course
      -- created for next term generated NOTHING under the old rule — the
      -- classes would have appeared, silently, weeks later.
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

  -- WHEN A MEMBERSHIP ENDED, on the studio's own clock.
  --
  -- The cancel mutation cannot carry this: the mutation grammar takes context
  -- only, so a caller-supplied date is the only shape it can express — and a
  -- cancellation dated by whichever machine made the request is permanently
  -- wrong for a studio across a UTC boundary. A read that is a day out corrects
  -- itself; a write that is a day out is wrong in the record forever.
  --
  -- BEFORE, so it lands in the same row write rather than a second one.
  CREATE OR REPLACE FUNCTION stamp_membership_end() RETURNS TRIGGER AS $ended$
  BEGIN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      NEW.ended_on := studio_today(NEW.studio_id);
    END IF;
    -- Coming BACK clears it. A reactivated membership still carrying an end date
    -- is a row that contradicts itself.
    IF NEW.status <> 'cancelled' AND OLD.status = 'cancelled' THEN
      NEW.ended_on := NULL;
    END IF;
    RETURN NEW;
  END;
  $ended$ LANGUAGE plpgsql;

  CREATE TRIGGER memberships_stamp_end
    BEFORE UPDATE OF status ON memberships
    FOR EACH ROW EXECUTE FUNCTION stamp_membership_end();



  -- ═══════════════════════════════════════════════════════════
  -- THE PARALLEL TABLES ARE GONE.
  --
  -- "member_cards", "member_bookings" and "member_enrolments" lived here: three
  -- tables holding facts three other tables already held, kept level by five
  -- triggers. They existed for one reason — a behavior was a property of the
  -- TABLE, so granting a member "bookings.read" granted them every booking at
  -- the studio, and the only way to say "their own" was a second table with a
  -- tighter rule attached.
  --
  -- Reach is a property of the RUNG now (charter: "scoping"), so the member
  -- reads the real tables, filtered. Every bug this area produced was a drift
  -- bug — a projection that did not exist, a mirror that INNER-joined, a
  -- fan-out that left stale rows — and none of them is expressible any more,
  -- because there is nothing left to drift from.
  --
  -- What the tables carried that the real ones do not: denormalised class and
  -- program names, so a phone did not join. That is three indexed joins now.
  --
  -- "member_cards" outlived the other two by a turn, on a second belief that was
  -- also wrong: that granting a member "subscriptions.read" handed it to every
  -- staff rung, because "member" was the base of the ladder. It was the LADDER
  -- that was wrong. A member is a relationship somebody has with the studio, not
  -- the least anybody can be, so it stands beside the staff roles now on a
  -- shared "base" rung, and a person who is both simply holds both. Nothing
  -- travels upward, and the card is the join it always was.
  -- ═══════════════════════════════════════════════════════════

  -- ─── joining a course ───────────────────────────────────────
  --
  -- ONE ROW, and the sessions follow. That is the whole difference between a
  -- course and six weeks of drop-in classes: a member says yes once, and the
  -- cohort is a fact rather than a coincidence of six separate bookings.
  --
  -- Cancelling an enrolment releases the whole block. Leaving the bookings
  -- behind would keep the seats occupied by somebody who has left, and the
  -- studio would find out by counting chairs.
  CREATE TABLE enrolments (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    course_id      TEXT NOT NULL REFERENCES courses(id),
    membership_id  TEXT NOT NULL REFERENCES memberships(id),
    person_id      TEXT NOT NULL REFERENCES people(id),
    status         TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'withdrawn')),
    enrolled_on    DATE NOT NULL,
    UNIQUE (course_id, membership_id)
  );

  -- The counter cache, kept by the database for the same reason every other one
  -- here is: a closed mutation grammar cannot say "enrolled_count + 1", which
  -- turned out to be the useful constraint.
  CREATE OR REPLACE FUNCTION sync_enrolled_count() RETURNS TRIGGER AS $ec$
  BEGIN
    UPDATE courses c
       SET enrolled_count = (SELECT count(*) FROM enrolments e WHERE e.course_id = c.id AND e.status = 'enrolled')
     WHERE c.id = COALESCE(NEW.course_id, OLD.course_id);
    RETURN NULL;
  END;
  $ec$ LANGUAGE plpgsql;

  -- The person is DERIVED from the membership, never sent.
  --
  -- A desk enrolling somebody names the membership it is looking at; the human
  -- behind it is a fact the database already holds. Passing both would mean a
  -- request could pair one member's membership with another's person id, and
  -- the row would be a quiet lie about who is on the course.
  CREATE OR REPLACE FUNCTION derive_enrolment_person() RETURNS TRIGGER AS $dep$
  BEGIN
    IF NEW.person_id IS NULL OR NEW.person_id = '' THEN
      SELECT person_id INTO NEW.person_id FROM memberships WHERE id = NEW.membership_id;
    END IF;
    IF NEW.person_id IS NULL THEN
      RAISE EXCEPTION 'That membership does not exist here.';
    END IF;

    -- Enrolling somebody who is already on the block.
    --
    -- The unique constraint would catch it, but "duplicate key value violates
    -- unique constraint enrolments_course_id_membership_id_key" is not a
    -- sentence to put in front of somebody at a counter. The rule is the
    -- database's; the wording is ours. Re-enrolling somebody who WITHDREW is a
    -- real thing a desk does, so that one reinstates rather than refuses.
    IF EXISTS (SELECT 1 FROM enrolments WHERE course_id = NEW.course_id AND membership_id = NEW.membership_id AND status = 'enrolled') THEN
      RAISE EXCEPTION 'They are already on that course.';
    END IF;

    IF EXISTS (SELECT 1 FROM enrolments WHERE course_id = NEW.course_id AND membership_id = NEW.membership_id) THEN
      UPDATE enrolments SET status = 'enrolled'
       WHERE course_id = NEW.course_id AND membership_id = NEW.membership_id;
      -- Returning NULL from a BEFORE trigger skips the insert, so the row is
      -- reused rather than duplicated — and the AFTER triggers on that UPDATE
      -- re-book the block and move the counter.
      RETURN NULL;
    END IF;

    RETURN NEW;
  END;
  $dep$ LANGUAGE plpgsql;

  CREATE TRIGGER enrolments_derive_person
    BEFORE INSERT ON enrolments
    FOR EACH ROW EXECUTE FUNCTION derive_enrolment_person();

  CREATE TRIGGER enrolments_sync_count
    AFTER INSERT OR UPDATE OR DELETE ON enrolments
    FOR EACH ROW EXECUTE FUNCTION sync_enrolled_count();

  -- Capacity is the COURSE's, not each session's. Twelve places means twelve
  -- people for the block, and the check belongs here for the same reason the
  -- session one does: two people enrolling at once must not both find room.
  CREATE OR REPLACE FUNCTION enforce_course_capacity() RETURNS TRIGGER AS $ecap$
  DECLARE
    v_cap  INTEGER;
    v_have INTEGER;
  BEGIN
    -- THE COURSE HAS TO BE THIS STUDIO'S, and open. Same argument as the one
    -- on bookings: two foreign keys that the types never make agree, and the
    -- studio is stamped from scope rather than sent. The deleted mirror table
    -- carried this for the member's path only.
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

  -- THE FAN-OUT. Enrolling books every session the course's slots generated;
  -- withdrawing cancels them again.
  --
  -- Booked as ordinary rows in "bookings", so the desk's roster, the session
  -- capacity check and the counter cache all work with no idea a course exists.
  -- A course is a way of making bookings, not a second kind of attendance.
  CREATE OR REPLACE FUNCTION fan_out_enrolment() RETURNS TRIGGER AS $fan$
  BEGIN
    IF NEW.status = 'enrolled' THEN
      INSERT INTO bookings (studio_id, session_id, membership_id, status)
      SELECT NEW.studio_id, cs.id, NEW.membership_id, 'booked'
        FROM class_sessions cs
        JOIN class_templates ct ON ct.id = cs.template_id
       WHERE ct.course_id = NEW.course_id
         AND cs.status = 'scheduled'
         AND cs.held_on >= studio_today(NEW.studio_id)
      -- DO UPDATE, not DO NOTHING.
      --
      -- A row already exists in two cases: the member booked that class on
      -- their own, and — the one that made this a bug — they were on the block
      -- before, withdrew, and are being put back. "DO NOTHING" left every one
      -- of those bookings CANCELLED, so re-enrolling gave somebody a place on
      -- the course and a seat at none of its classes. Setting the status is
      -- right for both cases: enrolled means booked.
      ON CONFLICT (session_id, membership_id) DO UPDATE SET status = 'booked';
    ELSE
      UPDATE bookings b SET status = 'cancelled'
       WHERE b.membership_id = NEW.membership_id
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

  -- ─── the automations themselves ─────────────────────────────
  --
  -- A REFLEX IS AN ARTIFACT, so it is a row. It was a TypeScript constant,
  -- which meant a studio could look at its automations, preview them and pause
  -- them — and could not create one, change when it runs, or see what it does.
  -- Three verbs missing out of five, because the thing itself was code.
  --
  -- What a studio authors is NOT a reflex. Nobody is writing a vex fingerprint
  -- and a prism template into a form, and letting them would hand a browser the
  -- ability to name any statement in the app. So the application ships a small
  -- set of SHAPES — "lapse trials", "remind about tomorrow", "send a digest" —
  -- and a row picks one and sets its knobs. The dangerous half stays authored;
  -- the half a studio actually wants to change becomes data.
  --
  -- That is the artifact-layer pattern in miniature, and the reason this table
  -- is worth reading before that lands: a template id plus typed parameters,
  -- rather than a blob nobody can validate.
  CREATE TABLE automations (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id    TEXT NOT NULL REFERENCES studios(id),
    -- WHO AND WHAT, SEPARATELY.
    --
    -- This was one column, "template", naming a shipped pair — and three pairs
    -- was the entire vocabulary. The studio could change WHEN one ran and
    -- nothing else, which is three cron jobs with a toggle rather than an
    -- automation system.
    --
    -- The two halves were never coupled: every shape already consisted of a
    -- SELECT (who it acts on) and an EFFECT (what it does to them), frozen
    -- together at build time by me. Splitting the column splits the decision.
    --
    -- The safety property is unchanged and that is the point: both columns are
    -- checked against registries the application ships, so a row still cannot
    -- name a statement this version does not have. It can only COMBINE the
    -- ones it does — which is how "warn people before their trial lapses"
    -- becomes expressible without a single new fingerprint.
    audience     TEXT NOT NULL,
    effect       TEXT NOT NULL,
    enabled      BOOLEAN NOT NULL DEFAULT true,
    -- The knobs. Typed columns rather than JSON, so a form can bind them and
    -- the database can refuse nonsense. Which of them a given row USES is
    -- decided by its pairing, and the form asks for exactly those.
    run_at       TEXT NOT NULL DEFAULT '03:00',
    trial_days   INTEGER NOT NULL DEFAULT 14,
    -- What a message says, when the effect is one. Authored by the studio,
    -- because the wording of a message to their members is theirs — it is the
    -- one part of an automation that is obviously data and was hardcoded.
    subject      TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One pairing per studio per window. Two rows differing only in trial_days
    -- is a real thing to want (warn at seven days, lapse at fourteen) and those
    -- differ by EFFECT, so this constraint does not stand in the way.
    UNIQUE (studio_id, audience, effect)
  );

  -- ─── what an automation has to say ──────────────────────────
  --
  -- There is no email in this application, and adding one to make automations
  -- interesting would have meant testing a mail provider instead of testing
  -- the automations. So a reflex that would send something writes a row here,
  -- and delivery becomes somebody else's later problem.
  --
  -- Which is the honest shape anyway: a message you can query, retry and show
  -- an operator beats one that exists only in a provider's logs.
  CREATE TABLE notifications (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    person_id   TEXT REFERENCES people(id),
    kind        TEXT NOT NULL,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    created_on  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ─── indexes the reads actually use ─────────────────────────

  CREATE INDEX notifications_studio ON notifications (studio_id, created_on);

  CREATE INDEX memberships_studio  ON memberships (studio_id, status);
  CREATE INDEX sessions_studio_day ON class_sessions (studio_id, held_on);
  CREATE INDEX bookings_session    ON bookings (session_id, status);
  CREATE INDEX check_ins_studio    ON check_ins (studio_id, held_on);

  -- THE FOREIGN KEYS THE APP ACTUALLY FILTERS ON.
  --
  -- Postgres indexes a primary key and a unique constraint; it does NOT index
  -- the referencing side of a foreign key. Every one of these is a column a
  -- screen filters or joins on every time it loads, and at seed scale a
  -- sequential scan over four hundred rows hides it completely.
  --
  -- They also matter for DELETE: without them, removing a parent row scans the
  -- whole child table to check the constraint.
  -- The member's own reads run through these now: their bookings, their
  -- enrolments, their subscription. They were the projections' indexes.
  CREATE INDEX bookings_membership    ON bookings (membership_id, status);
  CREATE INDEX check_ins_membership   ON check_ins (membership_id, held_on);
  CREATE INDEX subscriptions_member   ON subscriptions (membership_id, status);
  CREATE INDEX templates_studio       ON class_templates (studio_id, active);
  CREATE INDEX templates_course       ON class_templates (course_id);
  CREATE INDEX sessions_template      ON class_sessions (template_id, held_on);
  CREATE INDEX enrolments_course      ON enrolments (course_id, status);
  CREATE INDEX enrolments_membership  ON enrolments (membership_id, status);
  CREATE INDEX courses_studio         ON courses (studio_id, active);
  CREATE INDEX plans_studio           ON plans (studio_id, active);
  CREATE INDEX staff_studio           ON staff (studio_id, active);
  CREATE INDEX automations_studio     ON automations (studio_id);

  -- ═══════════════════════════════════════════════════════════
  -- EVERY DATE A STUDIO STAMPS, ON THE STUDIO'S CLOCK.
  --
  -- Last in the file because a trigger needs its table, and these span four of
  -- them. Found by a date rolling over: the assertions comparing a stamped date
  -- against studio_today had agreed for months and stopped at midnight UTC.
  -- ═══════════════════════════════════════════════════════════
  -- memberships.joined_on IS THE STUDIO'S DATE, not the server's.
  --
  -- A DEFAULT of CURRENT_DATE is the server's clock, and this app already decided
  -- that a studio owns its day: a gym in Kiritimati and one in Niue are on
  -- different dates at the same instant, and studio_today is what every read
  -- and every generator uses. This column was still on the other clock, which
  -- was invisible for exactly as long as the two agreed.
  --
  -- A column default cannot see a sibling column, so it is a trigger. An
  -- explicit value survives: only a NULL is filled, which is what lets a seed
  -- and a backfill say when something really happened.
  CREATE OR REPLACE FUNCTION stamp_memberships_joined_on() RETURNS TRIGGER AS $stampmemberships$
  BEGIN
    IF NEW.joined_on IS NULL THEN NEW.joined_on := studio_today(NEW.studio_id); END IF;
    RETURN NEW;
  END;
  $stampmemberships$ LANGUAGE plpgsql;

  CREATE TRIGGER memberships_stamp_joined_on
    BEFORE INSERT ON memberships
    FOR EACH ROW EXECUTE FUNCTION stamp_memberships_joined_on();


  -- check_ins.held_on IS THE STUDIO'S DATE, not the server's.
  --
  -- A DEFAULT of CURRENT_DATE is the server's clock, and this app already decided
  -- that a studio owns its day: a gym in Kiritimati and one in Niue are on
  -- different dates at the same instant, and studio_today is what every read
  -- and every generator uses. This column was still on the other clock, which
  -- was invisible for exactly as long as the two agreed.
  --
  -- A column default cannot see a sibling column, so it is a trigger. An
  -- explicit value survives: only a NULL is filled, which is what lets a seed
  -- and a backfill say when something really happened.
  CREATE OR REPLACE FUNCTION stamp_check_ins_held_on() RETURNS TRIGGER AS $stampcheck_ins$
  BEGIN
    IF NEW.held_on IS NULL THEN NEW.held_on := studio_today(NEW.studio_id); END IF;
    RETURN NEW;
  END;
  $stampcheck_ins$ LANGUAGE plpgsql;

  CREATE TRIGGER check_ins_stamp_held_on
    BEFORE INSERT ON check_ins
    FOR EACH ROW EXECUTE FUNCTION stamp_check_ins_held_on();


  -- enrolments.enrolled_on IS THE STUDIO'S DATE, not the server's.
  --
  -- A DEFAULT of CURRENT_DATE is the server's clock, and this app already decided
  -- that a studio owns its day: a gym in Kiritimati and one in Niue are on
  -- different dates at the same instant, and studio_today is what every read
  -- and every generator uses. This column was still on the other clock, which
  -- was invisible for exactly as long as the two agreed.
  --
  -- A column default cannot see a sibling column, so it is a trigger. An
  -- explicit value survives: only a NULL is filled, which is what lets a seed
  -- and a backfill say when something really happened.
  CREATE OR REPLACE FUNCTION stamp_enrolments_enrolled_on() RETURNS TRIGGER AS $stampenrolments$
  BEGIN
    IF NEW.enrolled_on IS NULL THEN NEW.enrolled_on := studio_today(NEW.studio_id); END IF;
    RETURN NEW;
  END;
  $stampenrolments$ LANGUAGE plpgsql;

  CREATE TRIGGER enrolments_stamp_enrolled_on
    BEFORE INSERT ON enrolments
    FOR EACH ROW EXECUTE FUNCTION stamp_enrolments_enrolled_on();
`;

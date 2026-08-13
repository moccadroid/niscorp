export const DDL = /* sql */ `
  -- ─── the look ───────────────────────────────────────────────

  CREATE TABLE themes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    tokens      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE theme_layouts (
    id          TEXT PRIMARY KEY,
    theme_id    TEXT NOT NULL REFERENCES themes(id),
    action_id   TEXT NOT NULL,
    layout      JSONB NOT NULL,
    UNIQUE (theme_id, action_id)
  );

  -- ─── the words ──────────────────────────────────────────────

  -- WHAT THIS APPLICATION SAYS, IN A LANGUAGE. The exact twin of "themes"
  -- above, and for the same reason: a studio's look and a studio's language
  -- are both things a person should be able to change without a release.
  --
  -- Keyed on the SOURCE PHRASE, not on an invented id. The English in the
  -- layouts stays the readable thing it is, and this table says what it reads
  -- as elsewhere. The cost of that choice is real and lives here: one English
  -- word with two senses ("Book" the verb, "Book" the noun) is one row and
  -- needs two German words. "context" is the escape — a disambiguated variant
  -- that a future $t directive names explicitly. Nothing sets it yet.
  --
  -- Rows, not a JSON file, because the same argument as the theme applies:
  -- a studio that calls its members "athletes" is one UPDATE, and the words
  -- an application uses are exactly the kind of thing whose owner is not the
  -- person who can deploy.
  CREATE TABLE phrases (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    locale      TEXT NOT NULL CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    source      TEXT NOT NULL,
    text        TEXT NOT NULL,
    -- Reserved: which SENSE of the source this is. NULL is "the only sense".
    context     TEXT,
    UNIQUE (locale, source, context)
  );

  CREATE INDEX phrases_by_locale ON phrases (locale);

  -- ─── the tenant ─────────────────────────────────────────────

  -- A studio. "theme" names the row in "themes" this studio wears; NULL means
  -- the stock look. "slug" is what a future public URL would use.
  CREATE TABLE studios (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL,            -- yoga | bjj | dance | pilates | gym | ...
    timezone    TEXT NOT NULL DEFAULT 'UTC',
    -- WHAT THIS STUDIO CHARGES IN. One currency, and the money tables point at
    -- this pair rather than carrying an opinion of their own — see the composite
    -- keys below. A studio that changes it has to move every price in the same
    -- statement, which is correct: a price list half in one currency is not a
    -- price list.
    currency    TEXT NOT NULL DEFAULT 'EUR',
    -- WHERE THIS STUDIO TRADES, as ISO-3166 alpha-2.
    --
    -- It decides more than an address: which payment methods a member is offered
    -- (SEPA against a card), which verification a payment provider asks the
    -- studio for, and which consumer law the contract sits under. It was a
    -- constant in the payments pack, which is fine for one country and wrong the
    -- first time somebody signs up from anywhere else.
    country     TEXT NOT NULL DEFAULT 'AT' CHECK (country ~ '^[A-Z]{2}$'),
    -- WHAT LANGUAGE THIS STUDIO READS IN, as a BCP-47 tag.
    --
    -- Sits beside "country" and "currency" rather than on a person, and that
    -- is a decision worth stating: language is the more personal of the two,
    -- but a studio is where the shared surface lives — the desk screen two
    -- people share, the words on a member's notice. Per-person is the obvious
    -- next move and needs only a second column and a COALESCE here.
    --
    -- The full tag matters. "de-AT" writes "€ 45,00" where "de-DE" writes
    -- "45,00 €" and "de-CH" writes "EUR 45.00" — three countries, one
    -- language, three answers, and a bare "de" would silently pick one.
    locale      TEXT NOT NULL DEFAULT 'en-GB' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    theme_id    TEXT REFERENCES themes(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Redundant as a constraint — "id" is already unique — and load-bearing as a
    -- TARGET: it is what lets a plan reference (studio, currency) as a pair.
    UNIQUE (id, currency)
  );

  -- STABLE, not IMMUTABLE, because it reads now(). Stable lets Postgres call it
  -- once per statement, which is what makes it safe inside a trigger: the day
  -- cannot change halfway through generating a term of classes.
  CREATE FUNCTION studio_today(studio TEXT) RETURNS DATE AS $tz$
    SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM studios WHERE id = studio), 'UTC'))::date;
  $tz$ LANGUAGE sql STABLE;

  -- ─── people ─────────────────────────────────────────────────

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

  -- ─── what a studio sells ────────────────────────────────────
  --
  -- Studios sell more than recurring plans: a drop-in class, a ten-class pass,
  -- a course. One table, a kind — because "what is on sale here" is one
  -- question, and the price list that cannot say "single class €18" is not the
  -- price list of a yoga studio. Courses stay their own dated, bounded table
  -- (a course is an EVENT with a capacity and a roster, not a product
  -- template); its price lives there.
  --
  --   recurring  a membership plan: interval, term, notice, allowance
  --   pass       N class credits; credits = 1 IS the drop-in — no third kind
  --
  -- Retiring an offering keeps everyone already on it, exactly as plans always
  -- worked: subscriptions and passes reference the offering they were SOLD on,
  -- never the current price list.
  CREATE TABLE offerings (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id        TEXT NOT NULL REFERENCES studios(id),
    name             TEXT NOT NULL,
    kind             TEXT NOT NULL DEFAULT 'recurring' CHECK (kind IN ('recurring', 'pass')),
    price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
    currency         TEXT NOT NULL DEFAULT 'EUR',
    -- ── recurring ──
    interval         TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
    class_allowance  INTEGER,
    minimum_term_months INTEGER NOT NULL DEFAULT 0 CHECK (minimum_term_months >= 0),
    -- How long before leaving takes effect. Notice given today on 30 days ends
    -- the subscription next month, not tonight — so it is still revenue.
    notice_days         INTEGER NOT NULL DEFAULT 0 CHECK (notice_days >= 0),
    -- ── pass ──
    -- How many classes the pack holds, and how long it lives once bought.
    -- NULL valid_days never expires. A pass MUST say how many classes it is.
    credits          INTEGER CHECK (credits IS NULL OR credits > 0),
    valid_days       INTEGER CHECK (valid_days IS NULL OR valid_days > 0),
    CHECK (kind <> 'pass' OR credits IS NOT NULL),
    active           BOOLEAN NOT NULL DEFAULT true,
    -- Redundant as a constraint — "id" is already unique — and load-bearing as
    -- a TARGET: it is what lets an entitlement reference (offering, studio) as
    -- a pair, so one studio's desk cannot sell another studio's price.
    UNIQUE (id, studio_id),
    -- ONE CURRENCY PER STUDIO, ENFORCED BY THE DATABASE.
    --
    -- Not a CHECK: a CHECK cannot see another row, so "all this studio's
    -- offerings agree" is not expressible as one. It is a composite foreign key
    -- instead — the pair (studio, currency) must be a pair the studio actually
    -- is, so an offering in a currency its studio does not charge in cannot be
    -- written at all.
    --
    -- This matters because "monthly_cents" is SUMMED across a studio's
    -- subscriptions with no currency predicate. Two currencies in one studio
    -- would not have failed; they would have quietly added together and reported
    -- a revenue figure that was not any amount of money.
    FOREIGN KEY (studio_id, currency) REFERENCES studios (id, currency)
  );

  -- ─── what a person holds ────────────────────────────────────
  --
  -- A subscription is an ENTITLEMENT — a person's standing right to attend —
  -- and it hangs off the person directly. No UNIQUE on (studio, person):
  -- somebody can hold a subscription and buy their partner a drop-in, or lapse
  -- and come back, and the schema no longer forbids the truth.
  CREATE TABLE subscriptions (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id      TEXT NOT NULL REFERENCES studios(id),
    person_id      TEXT NOT NULL REFERENCES people(id),
    offering_id    TEXT NOT NULL REFERENCES offerings(id),
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    -- HOW THE MONEY MOVES, decided when the subscription starts. Access and
    -- payment are different facts with different writers: the desk can put
    -- somebody on a plan the studio bills offline (SEPA at the bank, cash,
    -- invoice) with no payment processor anywhere, and a studio that connects
    -- one later gains a second WRITER, not a different model.
    --
    --   manual  the studio settles the money itself — the PRIMARY path
    --   stripe  checkout + webhooks assert the standing
    --   comp    access with no money: the owner's kid, a staff perk
    --   free    a genuinely free offering
    paid_via       TEXT NOT NULL DEFAULT 'manual' CHECK (paid_via IN ('manual', 'stripe', 'comp', 'free')),
    started_on     DATE NOT NULL,
    ends_on        DATE,

    -- ── the terms this person was sold, not the terms on sale today ──
    price_cents      INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),

    committed_until  DATE,

    -- DERIVED FROM subscription_notices, never written directly by a screen.
    --
    -- It lived here as a column somebody updated, which made "may give notice"
    -- and "may state a standing" the same grant: the charter grants table.verb
    -- and cannot tell two updates on one table apart, so a payments integration
    -- holding subscriptions.write.update could end somebody's membership by
    -- giving notice on their behalf. Notice is its own table now, and its own
    -- verb is what gates it.
    notice_given_on  DATE,

    monthly_cents    INTEGER NOT NULL DEFAULT 0,

    -- HOW FAR THEIR MONEY REACHES. The one fact a payment provider knows that
    -- this app cannot derive, and the whole of what billing writes back here.
    --
    -- Deliberately NOT a status. "Past due" is this date compared to today, and
    -- a status column holding it would be wrong for the whole of the day it
    -- lapsed and wrong forever if whatever updated it were switched off — the
    -- same argument that took "trialling" and "lapsed" out of
    -- the old memberships.status before that table was retired for it.
    -- Screens that care compare it; nobody stores the answer.
    paid_until       DATE,

    -- When the ROW appeared, distinct from when the subscription started:
    -- the watched "somebody joins" moment cursors on this, and a cursor must
    -- be monotonic — a backdated start would be invisible to it.
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Stamped from the plan by the trigger below, and pinned to the studio by
    -- the same composite key the plan uses. It is here rather than read through
    -- the plan because "price_cents" above is an OVERRIDE — a subscription can
    -- carry an amount the plan never had, and an amount without a currency is a
    -- number.
    currency         TEXT NOT NULL DEFAULT 'EUR',
    FOREIGN KEY (studio_id, currency) REFERENCES studios (id, currency),
    -- ONE STUDIO'S PRICE LIST, ENFORCED BY THE DATABASE. The engine stamps
    -- studio_id from scope and the caller names an offering — this pair is
    -- what refuses an offering from anywhere else, however the id arrived.
    -- Found by model-check the day subscriptions/start existed: without it, a
    -- desk could start a member on a competitor's price.
    FOREIGN KEY (offering_id, studio_id) REFERENCES offerings (id, studio_id)
  );

  CREATE OR REPLACE FUNCTION stamp_subscription_terms() RETURNS TRIGGER AS $sub$
  DECLARE
    p RECORD;
  BEGIN
    SELECT price_cents, interval, minimum_term_months, notice_days, currency INTO p FROM offerings WHERE id = NEW.offering_id;

    -- The offering's currency, always — a subscription does not get its own.
    -- The override beside it is an AMOUNT, not a price in another currency.
    NEW.currency := p.currency;

    -- Normalised to a month so intervals can be added together. Integer
    -- division rounds down by a few cents a year; a forecast is not a ledger.
    NEW.monthly_cents := CASE
      WHEN p.interval = 'year' THEN COALESCE(NEW.price_cents, p.price_cents) / 12
      ELSE COALESCE(NEW.price_cents, p.price_cents)
    END;

    -- A subscription starts the day it is written unless a caller with a
    -- reason says otherwise — and the desk's mutation sends no date at all.
    IF NEW.started_on IS NULL THEN
      NEW.started_on := studio_today(NEW.studio_id);
    END IF;

    -- Stamped once, at sign-up, and never moved by a later plan edit.
    IF NEW.committed_until IS NULL THEN
      NEW.committed_until := NEW.started_on + (p.minimum_term_months || ' months')::interval;
    END IF;

    -- Leaving is a DATE, not an event: notice runs its course, and a commitment
    -- outlives notice given inside it — whichever is later is when they go.
    -- Withdrawn notice clears the date, so the leaving date goes with it.
    IF NEW.notice_given_on IS NULL THEN
      NEW.ends_on := NULL;
    ELSE
      NEW.ends_on := GREATEST(NEW.committed_until, NEW.notice_given_on + (p.notice_days || ' days')::interval);
    END IF;

    RETURN NEW;
  END;
  $sub$ LANGUAGE plpgsql;

  CREATE TRIGGER subscriptions_stamp_terms
    BEFORE INSERT OR UPDATE OF offering_id, price_cents, notice_given_on, started_on ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION stamp_subscription_terms();

  -- Ending is a status change like everywhere else, and the date it happened
  -- is the studio's, not the browser's. Only stamped when nothing better is
  -- known: a subscription ending through notice already carries the derived
  -- date, and this must not overwrite the trigger's arithmetic.
  CREATE OR REPLACE FUNCTION stamp_subscription_end() RETURNS TRIGGER AS $subend$
  BEGIN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.ends_on IS NULL THEN
      NEW.ends_on := studio_today(NEW.studio_id);
    END IF;
    RETURN NEW;
  END;
  $subend$ LANGUAGE plpgsql;

  CREATE TRIGGER subscriptions_stamp_end
    BEFORE UPDATE OF status ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION stamp_subscription_end();

  -- ─── giving notice ──────────────────────────────────────────
  --
  -- ITS OWN TABLE, BECAUSE ITS OWN VERB IS THE ONLY THING THAT CAN GATE IT.
  --
  -- A charter grant is table.verb (packages/charter) — there is no per-statement
  -- granularity — so while notice was a column on "subscriptions", any rung that
  -- could state a billing standing could also end somebody's membership by
  -- giving notice for them. Splitting the table splits the grant, and the fence
  -- is drawn by the engine rather than by everyone remembering.
  --
  -- A LEDGER, not a flag: notice given, withdrawn, and given again is an
  -- ordinary sequence at a front desk, and each of those is a thing that
  -- happened on a day. Withdrawing marks the row rather than deleting it —
  -- there is no delete verb anywhere in this app.
  CREATE TABLE subscription_notices (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id       TEXT NOT NULL REFERENCES studios(id),
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    -- WHO GAVE IT. NULL from the desk (the row's authority is the person at
    -- the counter); pinned to the caller by scope on the member's own reach,
    -- and then VERIFIED by the trigger against the subscription's owner — so
    -- a member can end their own contract and can never end anybody else's,
    -- with the fence in the database rather than in a screen.
    person_id       TEXT REFERENCES people(id),
    -- Stamped by the trigger below from the studio's own clock. A browser never
    -- says what today is, and backdating notice past a commitment is precisely
    -- the number a minimum term exists to protect.
    given_on        DATE,
    withdrawn       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE FUNCTION stamp_notice() RETURNS TRIGGER AS $notice$
  BEGIN
    IF NEW.given_on IS NULL THEN
      NEW.given_on := studio_today(NEW.studio_id);
    END IF;
    IF NEW.person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM subscriptions s WHERE s.id = NEW.subscription_id AND s.person_id = NEW.person_id
    ) THEN
      RAISE EXCEPTION 'That is not your subscription to give notice on.';
    END IF;
    RETURN NEW;
  END;
  $notice$ LANGUAGE plpgsql;

  CREATE TRIGGER subscription_notices_stamp
    BEFORE INSERT ON subscription_notices
    FOR EACH ROW EXECUTE FUNCTION stamp_notice();

  -- The subscription's own copy, kept true by the ledger rather than by whoever
  -- wrote last. "Standing notice" is the newest row not withdrawn; nothing means
  -- NULL, and the terms trigger above turns that into a leaving date or none.
  CREATE FUNCTION apply_notice() RETURNS TRIGGER AS $applied$
  DECLARE
    sub TEXT := COALESCE(NEW.subscription_id, OLD.subscription_id);
  BEGIN
    UPDATE subscriptions s
       SET notice_given_on = (
             SELECT n.given_on FROM subscription_notices n
              WHERE n.subscription_id = sub AND NOT n.withdrawn
              ORDER BY n.given_on DESC, n.created_at DESC
              LIMIT 1)
     WHERE s.id = sub;
    RETURN NULL;
  END;
  $applied$ LANGUAGE plpgsql;

  CREATE TRIGGER subscription_notices_apply
    AFTER INSERT OR UPDATE ON subscription_notices
    FOR EACH ROW EXECUTE FUNCTION apply_notice();

  -- ─── pausing ────────────────────────────────────────────────
  --
  -- A LEDGER, its own table, for the same reason notice is: a charter grant is
  -- table.verb, and "may freeze their own training" must not be the grant that
  -- states billing standings or records payments. The subscription's status is
  -- DERIVED from the open pause by the trigger below, never written by the
  -- screen that asked.
  --
  -- PAUSE EXTENDS THE TERM (Decision D4): a paused month does not count toward
  -- the minimum — committed_until moves out by the pause's length when it
  -- ends. Otherwise pause is an escape hatch from a contract: freeze months
  -- three to twelve and pay for two.
  CREATE TABLE subscription_pauses (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id       TEXT NOT NULL REFERENCES studios(id),
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    -- Same fence as a notice: NULL from the desk, pinned to the caller on the
    -- member's reach, verified against the subscription's owner either way.
    person_id       TEXT REFERENCES people(id),
    paused_on       DATE,
    -- The screen may only say "resume" (the flag); the date is the studio
    -- clock's, stamped below — the split every date in this schema keeps.
    resumed         BOOLEAN NOT NULL DEFAULT false,
    resumed_on      DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE FUNCTION stamp_pause() RETURNS TRIGGER AS $pausestamp$
  BEGIN
    IF NEW.paused_on IS NULL THEN
      NEW.paused_on := studio_today(NEW.studio_id);
    END IF;
    IF NEW.person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM subscriptions s WHERE s.id = NEW.subscription_id AND s.person_id = NEW.person_id
    ) THEN
      RAISE EXCEPTION 'That is not your subscription to pause.';
    END IF;
    -- One open pause at a time: a second freeze while frozen is a no-op
    -- worth refusing in words rather than a ledger that double-counts.
    IF TG_OP = 'INSERT' AND EXISTS (
      SELECT 1 FROM subscription_pauses p WHERE p.subscription_id = NEW.subscription_id AND NOT p.resumed
    ) THEN
      RAISE EXCEPTION 'Already paused.';
    END IF;
    IF NEW.resumed AND NEW.resumed_on IS NULL THEN
      NEW.resumed_on := studio_today(NEW.studio_id);
    END IF;
    RETURN NEW;
  END;
  $pausestamp$ LANGUAGE plpgsql;

  CREATE TRIGGER subscription_pauses_stamp
    BEFORE INSERT OR UPDATE OF resumed ON subscription_pauses
    FOR EACH ROW EXECUTE FUNCTION stamp_pause();

  -- The ledger drives the subscription: an open pause is what "paused" IS,
  -- and closing one moves the commitment out by exactly the days frozen —
  -- the D4 arithmetic, in the one place every screen has to agree with.
  CREATE FUNCTION apply_pause() RETURNS TRIGGER AS $applypause$
  DECLARE
    frozen_days INTEGER;
    n_days INTEGER;
  BEGIN
    IF NOT NEW.resumed THEN
      UPDATE subscriptions s SET status = 'paused' WHERE s.id = NEW.subscription_id AND s.status = 'active';
    ELSE
      frozen_days := GREATEST(NEW.resumed_on - NEW.paused_on, 0);
      SELECT o.notice_days INTO n_days FROM subscriptions s JOIN offerings o ON o.id = s.offering_id WHERE s.id = NEW.subscription_id;
      UPDATE subscriptions s
         SET status = 'active',
             committed_until = CASE WHEN s.committed_until IS NULL THEN NULL ELSE s.committed_until + frozen_days END,
             -- The leaving date keeps the same rule the terms trigger states:
             -- a commitment outlives notice given inside it.
             ends_on = CASE
               WHEN s.notice_given_on IS NULL THEN s.ends_on
               ELSE GREATEST(COALESCE(s.committed_until + frozen_days, s.notice_given_on + n_days), s.notice_given_on + n_days)
             END
       WHERE s.id = NEW.subscription_id AND s.status = 'paused';
    END IF;
    RETURN NULL;
  END;
  $applypause$ LANGUAGE plpgsql;

  CREATE TRIGGER subscription_pauses_apply
    AFTER INSERT OR UPDATE OF resumed ON subscription_pauses
    FOR EACH ROW EXECUTE FUNCTION apply_pause();

  CREATE OR REPLACE FUNCTION resync_subscription_value() RETURNS TRIGGER AS $planval$
  BEGIN
    UPDATE subscriptions s
       SET monthly_cents = CASE WHEN NEW.interval = 'year' THEN NEW.price_cents / 12 ELSE NEW.price_cents END
     WHERE s.offering_id = NEW.id AND s.price_cents IS NULL;
    RETURN NULL;
  END;
  $planval$ LANGUAGE plpgsql;

  CREATE TRIGGER offerings_resync_value
    AFTER UPDATE OF price_cents, interval ON offerings
    FOR EACH ROW EXECUTE FUNCTION resync_subscription_value();

  CREATE INDEX subscriptions_forecast ON subscriptions (studio_id, status, ends_on);

  -- ─── passes ─────────────────────────────────────────────────
  --
  -- The other entitlement: N class credits, decremented as they are used.
  -- A drop-in is a pass with credits_total = 1 — the degenerate case, not a
  -- third table — which keeps "buy classes" one code path however many come
  -- in the pack.
  --
  -- "expired" is NOT a stored status: it is expires_on compared to the
  -- studio's day, derived at read like every other lapse in this schema — a
  -- stored one would be wrong for the whole of the day it lapsed and wrong
  -- forever if whatever updated it were switched off. "used_up" IS stored,
  -- because it is a fact the decrement trigger makes true in the same
  -- transaction that makes it so.
  CREATE TABLE passes (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id     TEXT NOT NULL REFERENCES studios(id),
    person_id     TEXT NOT NULL REFERENCES people(id),
    offering_id   TEXT NOT NULL REFERENCES offerings(id),
    credits_total INTEGER NOT NULL CHECK (credits_total > 0),
    credits_used  INTEGER NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
    CHECK (credits_used <= credits_total),
    paid_via      TEXT NOT NULL DEFAULT 'manual' CHECK (paid_via IN ('manual', 'stripe', 'comp', 'free')),
    purchased_on  DATE NOT NULL,
    expires_on    DATE,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used_up', 'refunded')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The same pair rule subscriptions carry: a pass is sold off THIS studio's
    -- price list, whatever id the caller named.
    FOREIGN KEY (offering_id, studio_id) REFERENCES offerings (id, studio_id)
  );

  -- Stamped like every other date here: the studio's clock, and the expiry
  -- copied from the offering's validity window at the moment of sale — the
  -- terms they were SOLD, not the terms on sale later.
  CREATE OR REPLACE FUNCTION stamp_pass_terms() RETURNS TRIGGER AS $pass$
  DECLARE
    o RECORD;
  BEGIN
    SELECT credits, valid_days INTO o FROM offerings WHERE id = NEW.offering_id;
    IF NEW.purchased_on IS NULL THEN
      NEW.purchased_on := studio_today(NEW.studio_id);
    END IF;
    IF NEW.credits_total IS NULL THEN
      NEW.credits_total := COALESCE(o.credits, 1);
    END IF;
    IF NEW.expires_on IS NULL AND o.valid_days IS NOT NULL THEN
      NEW.expires_on := NEW.purchased_on + o.valid_days;
    END IF;
    RETURN NEW;
  END;
  $pass$ LANGUAGE plpgsql;

  CREATE TRIGGER passes_stamp_terms
    BEFORE INSERT ON passes
    FOR EACH ROW EXECUTE FUNCTION stamp_pass_terms();

  -- ATTENDING is what spends a credit — a booking is a promise, and promises
  -- are cancelled. A check-in by somebody whose attendance no subscription
  -- covers draws down their oldest live pass, and the same transaction that
  -- spends the last credit marks the pass used up.
  CREATE OR REPLACE FUNCTION spend_pass_credit() RETURNS TRIGGER AS $spend$
  DECLARE
    covered BOOLEAN;
    p RECORD;
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM subscriptions s
       WHERE s.person_id = NEW.person_id AND s.studio_id = NEW.studio_id AND s.status = 'active'
    ) INTO covered;
    IF covered THEN RETURN NULL; END IF;

    SELECT id, credits_total, credits_used INTO p FROM passes
     WHERE person_id = NEW.person_id AND studio_id = NEW.studio_id
       AND status = 'active'
       AND credits_used < credits_total
       AND (expires_on IS NULL OR expires_on >= studio_today(NEW.studio_id))
     ORDER BY purchased_on ASC, created_at ASC
     LIMIT 1;
    IF p.id IS NULL THEN RETURN NULL; END IF;

    UPDATE passes
       SET credits_used = p.credits_used + 1,
           status = CASE WHEN p.credits_used + 1 >= p.credits_total THEN 'used_up' ELSE status END
     WHERE id = p.id;
    RETURN NULL;
  END;
  $spend$ LANGUAGE plpgsql;
  -- The trigger itself is created beside check_ins, below — the table this
  -- function watches does not exist yet at this point in the DDL.

  -- ─── which integrations a studio has bought ─────────────────
  CREATE TABLE studio_integrations (
    studio_id       TEXT NOT NULL REFERENCES studios(id),
    integration_id  TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    installed_on    DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (studio_id, integration_id)
  );

  -- ─── what happens at the studio ─────────────────────────────

  CREATE TABLE programs (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    name        TEXT NOT NULL,
    blurb       TEXT NOT NULL DEFAULT '',
    colour      TEXT NOT NULL DEFAULT 'indigo' CHECK (colour IN ('rose', 'amber', 'lime', 'emerald', 'teal', 'sky', 'indigo', 'violet', 'fuchsia', 'stone')),
    active      BOOLEAN NOT NULL DEFAULT true
  );

  -- ─── a course ───────────────────────────────────────────────
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
    -- A block has a price, so a block has a currency — the same pair rule as a
    -- plan. Every table holding money names what the money is, so no read has to
    -- infer it from a constraint holding somewhere else.
    currency       TEXT NOT NULL DEFAULT 'EUR',
    active         BOOLEAN NOT NULL DEFAULT true,

    enrolled_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (studio_id, currency) REFERENCES studios (id, currency)
  );

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

  -- Attendance is what spends a pass credit — see spend_pass_credit() above.
  CREATE TRIGGER check_ins_spend_pass
    AFTER INSERT ON check_ins
    FOR EACH ROW EXECUTE FUNCTION spend_pass_credit();

  -- ─── invariants the database owns ───────────────────────────

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

  -- ─── joining a course ───────────────────────────────────────
  --
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

  -- The counter cache, kept by the database like every other one here: a closed
  -- mutation grammar cannot say "enrolled_count + 1".
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

  -- ─── the vocabulary an automation is built from ─────────────
  --
  -- THE PRESENTATION HALF OF A CODE CONSTANT, PROJECTED AS ROWS.
  --
  -- A moment's behaviour cannot live here: its "watch" anchor and its
  -- "context" are functions, and code stays their only home. What CAN live
  -- here is everything a screen says about it — the phrase, the blurb,
  -- whether the number means anything — and putting that in rows is what
  -- lets an ordinary vex entry compose a card's whole sentence in its
  -- mapping, instead of a function fetching rows and captioning them in JS.
  -- The projection is refreshed at boot from the shipped constants, the way
  -- the directory is (see the seed's "vocabulary" block).
  --
  -- The FOREIGN KEYS are the second reason. "moment" and "effect" were free
  -- text, so a row could name a pairing no release has and nothing objected
  -- until a card rendered "This pairing is not in this version". The
  -- database refuses it now.
  CREATE TABLE automation_moments (
    id         TEXT PRIMARY KEY,
    phrase     TEXT NOT NULL,
    blurb      TEXT NOT NULL,
    -- Written (a fact wakes it) rather than clocked. A watched row has no
    -- hour, and one claiming an hour it ignores would be lying.
    watched    BOOLEAN NOT NULL DEFAULT false,
    days_label TEXT NOT NULL DEFAULT '',
    sort       INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE automation_effects (
    id            TEXT PRIMARY KEY,
    phrase        TEXT NOT NULL,
    blurb         TEXT NOT NULL,
    subject_label TEXT NOT NULL DEFAULT '',
    body_label    TEXT NOT NULL DEFAULT '',
    message_hint  TEXT NOT NULL DEFAULT '',
    sort          INTEGER NOT NULL DEFAULT 0
  );

  -- Nobody builds an automation from an empty form — they recognise a
  -- problem they have. A recipe is a pre-filled pairing, and it is a row for
  -- the same reason the moments are: so the screen that offers it can be a
  -- query, and "does this studio already run it" can be a join rather than a
  -- map built in a function.
  CREATE TABLE automation_recipes (
    id      TEXT PRIMARY KEY,
    title   TEXT NOT NULL,
    why     TEXT NOT NULL,
    icon    TEXT NOT NULL DEFAULT '',
    moment  TEXT NOT NULL REFERENCES automation_moments(id),
    effect  TEXT NOT NULL REFERENCES automation_effects(id),
    run_at  TEXT NOT NULL DEFAULT '09:00',
    days    INTEGER NOT NULL DEFAULT 7,
    subject TEXT NOT NULL DEFAULT '',
    body    TEXT NOT NULL DEFAULT '',
    sort    INTEGER NOT NULL DEFAULT 0
  );

  -- ─── the automations themselves ─────────────────────────────
  CREATE TABLE automations (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id    TEXT NOT NULL REFERENCES studios(id),
    moment       TEXT NOT NULL REFERENCES automation_moments(id),
    effect       TEXT NOT NULL REFERENCES automation_effects(id),
    enabled      BOOLEAN NOT NULL DEFAULT true,
    run_at       TEXT NOT NULL DEFAULT '09:00',
    days         INTEGER NOT NULL DEFAULT 7,
    -- Authored by the studio, because the wording of a message to their own
    -- members is theirs.
    subject      TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',
    -- HOW IT LAST RAN, mirrored from the engine's own ledger by a trigger
    -- (see wireRunMirror in boot.ts) — the counter-cache this schema uses for
    -- booked seats and the anchor's relationships. The card needs one line
    -- per automation and the ledger is keyed by a COMPOSED reflex id, which
    -- is a join no declared foreign key can carry; recomputing it is what
    -- the trigger is for, and reading it is then an ordinary column.
    last_run_state  TEXT NOT NULL DEFAULT '',
    last_run_done   INTEGER NOT NULL DEFAULT 0,
    last_run_failed INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One pairing per studio. Two rows over the same moment doing different
    -- things differ by effect, so this does not stand in the way.
    UNIQUE (studio_id, moment, effect)
  );

  -- ─── the studio being told things ───────────────────────────
  --
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

  CREATE TABLE outbox (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    person_id   TEXT REFERENCES people(id),
    channel     TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
    to_address  TEXT NOT NULL DEFAULT '',
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    -- 'queued' is where every row lives today, because nothing delivers. The
    -- other two exist so the shape does not change when something does.
    state       TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sent', 'failed')),
    source      TEXT NOT NULL DEFAULT '',
    created_on  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ─── indexes the reads actually use ─────────────────────────

  CREATE INDEX notifications_open ON notifications (studio_id, done, due_on);
  CREATE INDEX notifications_unseen ON notifications (studio_id, seen_at);
  CREATE INDEX outbox_studio   ON outbox (studio_id, created_on);

  -- ── the mirror resyncs ──────────────────────────────────────
  -- Created here, once every table they watch exists. Anything that moves a
  -- relationship row — a start, an assert, a pause applying, a credit spent,
  -- a withdrawal, a hire, a tag — lands on the same recompute.
  CREATE TRIGGER subscriptions_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();
  CREATE TRIGGER passes_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON passes
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();
  CREATE TRIGGER enrolments_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON enrolments
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();
  CREATE TRIGGER staff_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON staff
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();
  CREATE TRIGGER connections_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON connections
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();

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

  CREATE INDEX studio_people_studio ON studio_people (studio_id);
  CREATE INDEX studio_people_person ON studio_people (person_id);
  CREATE INDEX sessions_studio_day ON class_sessions (studio_id, held_on);
  CREATE INDEX bookings_session    ON bookings (session_id, status);
  CREATE INDEX check_ins_studio    ON check_ins (studio_id, held_on);

  CREATE INDEX bookings_person        ON bookings (person_id, status);
  CREATE INDEX check_ins_person       ON check_ins (person_id, held_on);
  CREATE INDEX subscriptions_person   ON subscriptions (person_id, status);
  CREATE INDEX passes_person          ON passes (person_id, status);
  CREATE INDEX templates_studio       ON class_templates (studio_id, active);
  CREATE INDEX templates_course       ON class_templates (course_id);
  CREATE INDEX sessions_template      ON class_sessions (template_id, held_on);
  CREATE INDEX enrolments_course      ON enrolments (course_id, status);
  CREATE INDEX enrolments_person      ON enrolments (person_id, status);
  CREATE INDEX courses_studio         ON courses (studio_id, active);
  CREATE INDEX offerings_studio       ON offerings (studio_id, active);
  CREATE INDEX staff_studio           ON staff (studio_id, active);
  CREATE INDEX automations_studio     ON automations (studio_id);

  CREATE OR REPLACE FUNCTION stamp_first_seen() RETURNS TRIGGER AS $stampknown$
  BEGIN
    IF NEW.first_seen_on IS NULL THEN NEW.first_seen_on := studio_today(NEW.studio_id); END IF;
    RETURN NEW;
  END;
  $stampknown$ LANGUAGE plpgsql;

  CREATE TRIGGER studio_people_stamp_first_seen
    BEFORE INSERT ON studio_people
    FOR EACH ROW EXECUTE FUNCTION stamp_first_seen();

  CREATE OR REPLACE FUNCTION stamp_check_ins_held_on() RETURNS TRIGGER AS $stampcheck_ins$
  BEGIN
    IF NEW.held_on IS NULL THEN NEW.held_on := studio_today(NEW.studio_id); END IF;
    RETURN NEW;
  END;
  $stampcheck_ins$ LANGUAGE plpgsql;

  CREATE TRIGGER check_ins_stamp_held_on
    BEFORE INSERT ON check_ins
    FOR EACH ROW EXECUTE FUNCTION stamp_check_ins_held_on();

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

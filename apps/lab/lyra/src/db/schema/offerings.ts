// What a studio sells: one price list, one row per thing on it.
export const OFFERINGS_DDL = /* sql */ `
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
  -- THE TERMS THEY WERE SOLD, and where that rule is stated. Retiring an
  -- offering keeps everyone already on it, exactly as plans always worked:
  -- subscriptions and passes reference the offering they were SOLD on, never
  -- the current price list, and every term that could move — a price, a
  -- notice period, a validity window — is stamped onto the entitlement at the
  -- sale. A price list edited next spring must not rewrite what somebody paid
  -- last autumn.
  CREATE TABLE offerings (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id        TEXT NOT NULL REFERENCES studios(id),
    -- A NAME IS THE ONE THING IT CANNOT BE SOLD WITHOUT. NOT NULL accepts the
    -- empty string, and the form asked nothing, so opening the sheet and
    -- pressing Add wrote a nameless row at zero — and the only way out of it was
    -- to retire it, which is how a price list fills up with things that were
    -- never products.
    --
    -- Zero stays legal: a free plan is a real thing a studio sells. Nameless
    -- does not.
    name             TEXT NOT NULL CHECK (btrim(name) <> ''),
    -- WHAT SORT OF THING THIS IS, and the third one is not a variation on the
    -- first two.
    --
    --   recurring  a membership: bills on a period, carries terms
    --   pass       classes bought up front: credits, spent by attending
    --   one_off    sold once and grants no attendance at all
    --
    -- A joining fee, a deposit, a workshop ticket, a gi off the shelf. Every one
    -- of them was unsellable here, and the workaround — a one-credit pass — was
    -- a lie the whole app would then believe: it would grant a class, count as
    -- an entitlement, and make somebody a pass holder for buying a T-shirt.
    kind             TEXT NOT NULL DEFAULT 'recurring' CHECK (kind IN ('recurring', 'pass', 'one_off')),
    price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
    currency         TEXT NOT NULL DEFAULT 'EUR',
    -- ── recurring ──
    --
    -- HOW OFTEN, IN THE STUDIO'S OWN WORDS. Month and year were the whole
    -- vocabulary, which quietly excluded every studio that bills quarterly —
    -- ordinary in AT and DE — and every one that runs a weekly subscription.
    -- Neither was refused by anything; nobody had written the other words down.
    --
    -- The pair is the period: ('month', 3) is quarterly, ('week', 2) is
    -- fortnightly, ('month', 1) is what everything was before this column
    -- existed and is what every existing row defaults to.
    --
    -- These four are Stripe's set, and that is the one constraint here that is
    -- not ours to widen: a price with a period a processor cannot express is a
    -- price nobody can be charged. Stripe also caps a period at a year
    -- (365 days, 52 weeks, 12 months, 1 year), which the integration surfaces
    -- rather than this column guessing at.
    interval         TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('day', 'week', 'month', 'year')),
    interval_count   INTEGER NOT NULL DEFAULT 1 CHECK (interval_count > 0),
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
    -- ── WHAT JOINING COSTS ON TOP ────────────────────────────
    --
    -- A joining fee is a one-off that is not chosen — it is charged BECAUSE
    -- somebody joined. Until this column existed a studio could create one and
    -- price it, and nothing ever charged it: it appeared on the member's Buy
    -- screen as something they might voluntarily purchase, which nobody will
    -- ever do.
    --
    -- It POINTS AT AN OFFERING rather than holding an amount, so the fee is a
    -- thing with a name and a price that a studio can retire, reprice and see on
    -- its own list — and so two plans can share one fee without it being typed
    -- twice.
    --
    -- Only meaningful on a recurring plan; the pair FK keeps the fee inside this
    -- studio, and the trigger below keeps it a one-off rather than, say, a
    -- membership that would silently be sold twice.
    joining_fee_id   TEXT,
    -- ── HOW MANY THINGS POINT AT THIS PRICE ──────────────────
    --
    -- Retiring exists because subscriptions, passes and purchases reference the
    -- offering they were SOLD on, and a studio that drops a price still has
    -- people paying it. That rule is right and it is not changing.
    --
    -- But an offering NOBODY EVER HELD is not history, it is a typo — and there
    -- was no way to be rid of one, so the only exit from a mistake was to retire
    -- it and let it sit on the list forever.
    --
    -- A counter cache, as courses.enrolled_count states the rule. It decides
    -- which BUTTON the form offers and nothing more: the foreign keys below are
    -- what actually refuse a delete, so a count that drifted would cost a
    -- readable error and never a row somebody was paying for.
    held_count       INTEGER NOT NULL DEFAULT 0,
    active           BOOLEAN NOT NULL DEFAULT true,
    -- THE PAIR TARGET, and where that rule is stated. Redundant as a
    -- constraint — "id" is already unique — and load-bearing as a TARGET: it
    -- is what lets an entitlement reference (offering, studio) as a PAIR
    -- rather than as an id, so one studio's desk cannot sell another studio's
    -- price however the id arrived. Every table that holds an entitlement or
    -- an amount carries the matching composite key back to here or to studios.
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
    FOREIGN KEY (studio_id, currency) REFERENCES studios (id, currency),
    -- The same pair rule everything else here carries: a plan cannot name
    -- another studio's fee, however the id arrived.
    FOREIGN KEY (joining_fee_id, studio_id) REFERENCES offerings (id, studio_id)
  );

  CREATE INDEX offerings_studio ON offerings (studio_id, active);

  -- A JOINING FEE IS A ONE-OFF, and the database is what says so.
  --
  -- A CHECK cannot see another row, so this is a trigger. Pointing a plan at
  -- another PLAN would put a second recurring subscription on every checkout;
  -- pointing it at a PASS would hand out classes with every signup. Both are
  -- the kind of mistake that looks like a working screen.
  CREATE OR REPLACE FUNCTION check_joining_fee() RETURNS TRIGGER AS $jf$
  DECLARE
    fee_kind TEXT;
  BEGIN
    IF NEW.joining_fee_id IS NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.kind <> 'recurring' THEN
      RAISE EXCEPTION 'only a recurring plan can carry a joining fee';
    END IF;
    SELECT kind INTO fee_kind FROM offerings WHERE id = NEW.joining_fee_id;
    IF fee_kind <> 'one_off' THEN
      RAISE EXCEPTION 'a joining fee must be a one-off, not a %', COALESCE(fee_kind, 'missing offering');
    END IF;
    RETURN NEW;
  END;
  $jf$ LANGUAGE plpgsql;

  CREATE TRIGGER offerings_check_joining_fee
    BEFORE INSERT OR UPDATE OF joining_fee_id, kind ON offerings
    FOR EACH ROW EXECUTE FUNCTION check_joining_fee();

  -- THE RECOUNT, in one place, called by every table that can hold one.
  --
  -- A full recount rather than an increment: the same choice enrolments makes,
  -- and for the same reason — a counter that adds and subtracts is a counter
  -- that can be wrong forever after one missed path, and this one is read by a
  -- screen deciding whether something is deletable.
  --
  -- The fourth term is the self-reference: a plan naming this one as its
  -- joining fee holds it just as firmly as a member does.
  -- THE COUNT ITSELF, as an expression with two callers: the cache below and
  -- the refusal further down. Written once because a delete guard that counted
  -- differently from the number on the screen would offer a button and then
  -- refuse it.
  -- plpgsql rather than sql, and not a style choice: a LANGUAGE sql body is
  -- resolved against the catalog the moment it is created, and the three tables
  -- it counts are declared after this one. A plpgsql body is not, which is why
  -- every function in this schema is one.
  CREATE OR REPLACE FUNCTION offering_holds(which TEXT) RETURNS INTEGER AS $oh$
  DECLARE
    held INTEGER;
  BEGIN
    SELECT (SELECT count(*) FROM subscriptions s WHERE s.offering_id = which)
         + (SELECT count(*) FROM passes p WHERE p.offering_id = which)
         + (SELECT count(*) FROM purchases u WHERE u.offering_id = which)
         + (SELECT count(*) FROM offerings f WHERE f.joining_fee_id = which)
      INTO held;
    RETURN held;
  END;
  $oh$ LANGUAGE plpgsql STABLE;

  CREATE OR REPLACE FUNCTION sync_offering_holds(which TEXT) RETURNS VOID AS $soh$
  BEGIN
    IF which IS NULL THEN RETURN; END IF;
    UPDATE offerings SET held_count = offering_holds(which) WHERE id = which;
  END;
  $soh$ LANGUAGE plpgsql;

  -- Every holder's table hangs this on itself — see subscriptions, passes and
  -- purchases, each of which says so where it declares the column.
  CREATE OR REPLACE FUNCTION sync_offering_holds_of_row() RETURNS TRIGGER AS $sohr$
  BEGIN
    PERFORM sync_offering_holds(COALESCE(NEW.offering_id, OLD.offering_id));
    RETURN NULL;
  END;
  $sohr$ LANGUAGE plpgsql;

  -- The self-reference gets its own, because the column it watches is not
  -- called offering_id and the row it counts against is not this row.
  CREATE OR REPLACE FUNCTION sync_joining_fee_holds() RETURNS TRIGGER AS $sjf$
  BEGIN
    PERFORM sync_offering_holds(NEW.joining_fee_id);
    PERFORM sync_offering_holds(OLD.joining_fee_id);
    RETURN NULL;
  END;
  $sjf$ LANGUAGE plpgsql;

  CREATE TRIGGER offerings_sync_joining_fee_holds
    AFTER INSERT OR UPDATE OF joining_fee_id OR DELETE ON offerings
    FOR EACH ROW EXECUTE FUNCTION sync_joining_fee_holds();

  -- DELETING IS FOR MISTAKES, and the database is what decides which is which.
  --
  -- It COUNTS rather than reading the cache — a cache is what a screen reads,
  -- and this is the answer. It cannot refresh the cache either: updating the
  -- row a BEFORE DELETE is about is Postgres refusing the whole statement with
  -- a sentence about tuples, which is exactly the kind of error this exists to
  -- replace.
  --
  -- Without it the refusal is still correct — three foreign keys see to that —
  -- but it arrives as a constraint name, and somebody who mistyped a price
  -- should be told what to do instead.
  CREATE OR REPLACE FUNCTION refuse_to_delete_held() RETURNS TRIGGER AS $rdh$
  BEGIN
    IF offering_holds(OLD.id) > 0 THEN
      RAISE EXCEPTION 'Somebody holds this, so it cannot be deleted. Retire it instead and everybody on it keeps it.';
    END IF;
    RETURN OLD;
  END;
  $rdh$ LANGUAGE plpgsql;

  CREATE TRIGGER offerings_refuse_to_delete_held
    BEFORE DELETE ON offerings
    FOR EACH ROW EXECUTE FUNCTION refuse_to_delete_held();
`;

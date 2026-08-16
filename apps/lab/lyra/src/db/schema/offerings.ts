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
    name             TEXT NOT NULL,
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
`;

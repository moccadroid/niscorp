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
  -- Retiring an offering keeps everyone already on it, exactly as plans always
  -- worked: subscriptions and passes reference the offering they were SOLD on,
  -- never the current price list.
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

  CREATE INDEX offerings_studio ON offerings (studio_id, active);
`;

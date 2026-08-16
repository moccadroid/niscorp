// What a person holds: a standing right to attend, and the terms they were
// sold — stamped once, kept in one unit, and never written by a screen.
export const SUBSCRIPTIONS_DDL = /* sql */ `
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
    -- THE PAID_UNTIL DOCTRINE takes its name from this column, and this is
    -- where it is stated. Deliberately NOT a status: "past due" is this date
    -- compared to today, and a status column holding that answer would be
    -- wrong for the whole of the day it lapsed and wrong forever if whatever
    -- updated it were switched off — the same argument that took "trialling"
    -- and "lapsed" out of the old memberships.status before that table was
    -- retired for it. Screens that care compare it; nobody stores the answer.
    -- Every lapse in this schema is derived the same way, from a date or a
    -- count: a pass expiring, a trial closing, a horizon on the anchor.
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

  -- ─── WHAT A PERIOD IS WORTH IN A MONTH ──────────────────────
  --
  -- monthly_cents is SUMMED across a studio's subscriptions to make every
  -- revenue figure in the app, so a yearly plan and a weekly one have to arrive
  -- in the same unit or the total is not an amount of money. This is the one
  -- place that conversion is decided.
  --
  -- It exists as a function because TWO triggers need it — one when a
  -- subscription is written, one when the offering under it is repriced — and
  -- they used to hold the same CASE expression twice. Two copies of arithmetic
  -- is one copy and a future disagreement.
  --
  -- 30.436875 is 365.25 / 12: the average month, which is what a weekly plan
  -- has to be measured against. It is not the length of any particular month
  -- and does not need to be — a forecast is not a ledger, and the alternative
  -- (a figure that changes in February) is worse.
  CREATE OR REPLACE FUNCTION months_per_period(unit TEXT, periods INTEGER) RETURNS NUMERIC AS $mpp$
    SELECT CASE unit
      WHEN 'day'  THEN periods / 30.436875
      WHEN 'week' THEN periods * 7 / 30.436875
      WHEN 'year' THEN periods * 12
      ELSE periods
    END::numeric;
  $mpp$ LANGUAGE sql IMMUTABLE;

  CREATE OR REPLACE FUNCTION stamp_subscription_terms() RETURNS TRIGGER AS $sub$
  DECLARE
    p RECORD;
  BEGIN
    SELECT price_cents, interval, interval_count, minimum_term_months, notice_days, currency INTO p FROM offerings WHERE id = NEW.offering_id;

    -- The offering's currency, always — a subscription does not get its own.
    -- The override beside it is an AMOUNT, not a price in another currency.
    NEW.currency := p.currency;

    -- Normalised to a month so periods can be added together. ROUND rather than
    -- integer division, which used to lose a few cents on every yearly plan in
    -- the same direction — a systematic undercount across a whole roll, which is
    -- the shape of error a forecast should not have.
    NEW.monthly_cents := ROUND(COALESCE(NEW.price_cents, p.price_cents) / months_per_period(p.interval, p.interval_count));

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

  CREATE OR REPLACE FUNCTION resync_subscription_value() RETURNS TRIGGER AS $planval$
  BEGIN
    UPDATE subscriptions s
       SET monthly_cents = ROUND(NEW.price_cents / months_per_period(NEW.interval, NEW.interval_count))
     WHERE s.offering_id = NEW.id AND s.price_cents IS NULL;
    RETURN NULL;
  END;
  $planval$ LANGUAGE plpgsql;

  -- interval_count joins the columns that fire this: a plan moved from monthly
  -- to quarterly at the same price is a third of the monthly revenue it was, and
  -- a forecast that did not hear about it would keep reporting the old figure.
  CREATE TRIGGER offerings_resync_value
    AFTER UPDATE OF price_cents, interval, interval_count ON offerings
    FOR EACH ROW EXECUTE FUNCTION resync_subscription_value();

  -- The anchor's mirrors follow every move — see resync_relationships_row in
  -- people.ts.
  CREATE TRIGGER subscriptions_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();

  -- AND IT HOLDS THE OFFERING IT WAS SOLD ON, which is what stops the studio
  -- deleting that price. See offerings.held_count for why a screen needs to
  -- know the difference between a product and a typo.
  CREATE TRIGGER subscriptions_sync_offering_holds
    AFTER INSERT OR UPDATE OF offering_id OR DELETE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION sync_offering_holds_of_row();

  CREATE INDEX subscriptions_forecast ON subscriptions (studio_id, status, ends_on);
  CREATE INDEX subscriptions_person   ON subscriptions (person_id, status);
`;

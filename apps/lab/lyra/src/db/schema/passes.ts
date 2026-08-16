// Passes: N class credits, and the attendance that spends one.
export const PASSES_DDL = /* sql */ `
  -- The other entitlement: N class credits, decremented as they are used.
  -- A drop-in is a pass with credits_total = 1 — the degenerate case, not a
  -- third table — which keeps "buy classes" one code path however many come
  -- in the pack.
  --
  -- "expired" is NOT a stored status: it is expires_on compared to the
  -- studio's day, derived at read — the paid_until doctrine. "used_up" IS
  -- stored, and the contrast is the whole of what that doctrine says: it is a
  -- fact the decrement trigger makes true in the same transaction that makes
  -- it so, so there is no day on which it can be wrong.
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
    -- WHAT PAID FOR IT, when the money moved somewhere else.
    --
    -- A payment provider redelivers: the same completed checkout arrives twice,
    -- or a handler fails halfway and the whole delivery is retried. A
    -- subscription survives that because its write is an ASSERTION — restating
    -- a standing twice states it once. Selling a pass cannot be: it is an
    -- insert, and two of them are two ten-packs.
    --
    -- So the purchase carries its own name and the constraint below refuses the
    -- second one.
    --
    -- NULL for a sale at the desk, and null rather than empty for a reason
    -- Postgres supplies: nulls do not collide, so every hand-sold pass can have
    -- no reference without them all being the same reference. That is what lets
    -- this be a real UNIQUE rather than a partial index — and a real one is what
    -- an ON CONFLICT can name (passes/sell), which is the difference between a
    -- redelivery being a quiet no-op and being an error somebody has to read.
    purchase_ref  TEXT,
    UNIQUE (studio_id, purchase_ref),
    -- The pair target: a pass is sold off THIS studio's price list, whatever
    -- id the caller named.
    FOREIGN KEY (offering_id, studio_id) REFERENCES offerings (id, studio_id)
  );

  -- The studio's clock, and the terms they were sold: the expiry is copied
  -- from the offering's validity window at the moment of sale, so a validity
  -- window edited later does not move a pass somebody already holds.
  CREATE OR REPLACE FUNCTION stamp_pass_terms() RETURNS TRIGGER AS $pass$
  DECLARE
    o RECORD;
  BEGIN
    SELECT kind, credits, valid_days INTO o FROM offerings WHERE id = NEW.offering_id;
    -- A PASS IS SOLD OFF A PASS. Selling one off a joining fee would stamp
    -- credits_total = 1 and hand out a free class with it — the exact harm the
    -- one_off kind exists to prevent, and the exact mistake a caller naming the
    -- wrong kind would make. The database refuses rather than every caller
    -- remembering.
    IF o.kind <> 'pass' THEN
      RAISE EXCEPTION 'offering % is not a pass, so no pass can be sold off it', NEW.offering_id;
    END IF;
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
  -- The trigger that carries this is created in bookings.ts, with check_ins:
  -- a trigger names a real table, so it belongs where that table is. The
  -- function may name one it has never seen — plpgsql bodies are not validated
  -- at creation.

  -- The anchor's mirrors follow every move — see resync_relationships_row in
  -- people.ts.
  CREATE TRIGGER passes_resync_relationships
    AFTER INSERT OR UPDATE OR DELETE ON passes
    FOR EACH ROW EXECUTE FUNCTION resync_relationships_row();

  -- AND IT HOLDS THE OFFERING IT WAS SOLD ON, which is what stops the studio
  -- deleting that price. See offerings.held_count for why a screen needs to
  -- know the difference between a product and a typo.
  CREATE TRIGGER passes_sync_offering_holds
    AFTER INSERT OR UPDATE OF offering_id OR DELETE ON passes
    FOR EACH ROW EXECUTE FUNCTION sync_offering_holds_of_row();

  CREATE INDEX passes_person ON passes (person_id, status);
`;

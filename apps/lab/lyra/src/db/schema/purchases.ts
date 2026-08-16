// Things bought once, that grant nothing: the joining fee, the gi, the ticket.
export const PURCHASES_DDL = /* sql */ `
  -- The joining fee, the deposit, the workshop ticket, the gi. A studio sells
  -- these and had nowhere to put them: the only entitlements this app knew were
  -- a membership and a pass, and both grant ATTENDANCE. Recording a T-shirt as a
  -- one-credit pass would have granted a class with it and made the buyer a pass
  -- holder on every screen that derives standing.
  --
  -- So this table grants nothing, and standing.ts does not read it. It is a
  -- record of a sale, and that is all it is.
  --
  -- THE AMOUNT IS STAMPED AT THE SALE, unlike a pass — which carries no price at
  -- all, because what a pass is worth is its credits and the offering's price is
  -- only what it cost that day. A one-off IS its price: "they paid the joining
  -- fee" is not a fact without the number, and a price list edit next spring
  -- must not rewrite what somebody paid last autumn.
  --
  -- WORTH SAYING PLAINLY: with paid_via = manual this is the first place
  -- lyra stores an amount of money taken at a counter on a date. That is what a
  -- sales record IS, and it is the row an accountant would ask about when
  -- deciding whether this app falls under Registrierkassenpflicht (§131b BAO).
  -- Paid through a provider it is not in question — the provider issues the
  -- receipt. Paid in cash it is the studio's own till that must, and the
  -- intended answer is a POS integration mirroring a certified one rather than
  -- this app becoming it. Until that is settled, this table records and issues
  -- nothing: there is no receipt number here and no document.
  CREATE TABLE purchases (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id     TEXT NOT NULL REFERENCES studios(id),
    person_id     TEXT NOT NULL REFERENCES people(id),
    offering_id   TEXT NOT NULL REFERENCES offerings(id),
    -- What was actually charged, in the currency it was charged in. Stamped by
    -- the trigger below from the offering, at the moment of sale.
    price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
    currency      TEXT NOT NULL DEFAULT 'EUR',
    paid_via      TEXT NOT NULL DEFAULT 'manual' CHECK (paid_via IN ('manual', 'stripe', 'comp', 'free')),
    purchased_on  DATE NOT NULL,
    -- Same rule, same reason as a pass: one outside payment, one row. NULL at a
    -- desk, and nulls do not collide.
    purchase_ref  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (studio_id, purchase_ref),
    FOREIGN KEY (offering_id, studio_id) REFERENCES offerings (id, studio_id),
    FOREIGN KEY (studio_id, currency) REFERENCES studios (id, currency)
  );

  CREATE INDEX purchases_person ON purchases (studio_id, person_id, purchased_on DESC);

  CREATE OR REPLACE FUNCTION stamp_purchase_terms() RETURNS TRIGGER AS $buy$
  DECLARE
    o RECORD;
  BEGIN
    SELECT kind, price_cents, currency INTO o FROM offerings WHERE id = NEW.offering_id;
    -- The same fence from the other side: this table is for things that grant
    -- nothing, and a membership or a pass recorded here would be an entitlement
    -- somebody paid for and never received.
    IF o.kind <> 'one_off' THEN
      RAISE EXCEPTION 'offering % is not a one-off, so it cannot be recorded as one', NEW.offering_id;
    END IF;
    IF NEW.purchased_on IS NULL THEN
      NEW.purchased_on := studio_today(NEW.studio_id);
    END IF;
    -- The price they were SOLD, not the price on the list later. A caller may
    -- send neither; nothing sends its own number.
    IF NEW.price_cents IS NULL THEN
      NEW.price_cents := COALESCE(o.price_cents, 0);
    END IF;
    NEW.currency := o.currency;
    RETURN NEW;
  END;
  $buy$ LANGUAGE plpgsql;

  CREATE TRIGGER purchases_stamp_terms
    BEFORE INSERT ON purchases
    FOR EACH ROW EXECUTE FUNCTION stamp_purchase_terms();

  -- AND IT HOLDS THE OFFERING IT WAS SOLD ON, which is what stops the studio
  -- deleting that price. See offerings.held_count for why a screen needs to
  -- know the difference between a product and a typo.
  CREATE TRIGGER purchases_sync_offering_holds
    AFTER INSERT OR UPDATE OF offering_id OR DELETE ON purchases
    FOR EACH ROW EXECUTE FUNCTION sync_offering_holds_of_row();
`;

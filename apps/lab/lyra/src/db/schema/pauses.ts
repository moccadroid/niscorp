// Pausing: a ledger of freezes, and the term arithmetic that follows one.
export const PAUSES_DDL = /* sql */ `
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
    -- The screen may only say "resume" (the flag); the date is the studio's
    -- clock, stamped below — and the split matters here more than anywhere,
    -- because the resume date is what the term extension is measured from.
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
`;

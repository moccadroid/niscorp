// Giving notice: a ledger of it, and the subscription's own copy kept true.
export const NOTICES_DDL = /* sql */ `
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
    -- The studio's clock, stamped by the trigger below — and the table where
    -- that rule earns its keep: backdating notice past a commitment is
    -- precisely the number a minimum term exists to protect.
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
  -- NULL, and the terms trigger in subscriptions.ts turns that into a leaving
  -- date or none.
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
`;

-- Up Migration

-- PRICES ARE LAZY AND CONTENT-ADDRESSED (S7).
--
-- There is no sync loop between lyra's price list and Stripe's, and that is the
-- design rather than a shortcut: a loop has to decide what to do when the two
-- disagree, and every answer to that is wrong for somebody already paying.
--
-- Instead, a Price is MATERIALISED AT CHECKOUT and addressed by what it IS —
-- (connected account, amount, interval, currency). Ask for the same four twice
-- and you get the same Price; edit a plan in lyra and the next checkout simply
-- asks for a different four and gets a new one. Nobody already subscribed moves,
-- which is the same rule lyra's own pricing screen states about retiring a plan.
--
-- The KEY is the address, and it is the primary key: two checkouts racing on the
-- same plan cannot create two Prices, because the second insert loses.
CREATE TABLE stripe_prices (
  price_key   TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  price_id    TEXT NOT NULL,
  -- What the key was made of, kept legible. An operator looking at this table
  -- should not have to parse the key to see what it addresses.
  amount      INTEGER NOT NULL,
  currency    TEXT NOT NULL,
  interval    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WHO IS PAYING, per membership.
--
-- A Stripe customer belongs to the CONNECTED account, not to the platform — the
-- studio is the merchant, so the customer is the studio's. Keyed by membership
-- because that is the identifier lyra hands over at the wire; this service never
-- learns a person's name and does not want one.
CREATE TABLE stripe_customers (
  membership_id TEXT PRIMARY KEY,
  studio_id     TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, customer_id)
);

CREATE INDEX stripe_customers_studio ON stripe_customers (studio_id);

-- Down Migration

DROP TABLE IF EXISTS stripe_customers;
DROP TABLE IF EXISTS stripe_prices;

-- Up Migration

-- LYRA'S REMODEL REACHED THE WIRE. A person is no longer forced to BE a
-- membership, so the identifier lyra hands over is a person id, and the
-- assert key is the SUBSCRIPTION id — a person may hold more than one, and a
-- webhook must never guess which one it is about.
--
-- Customers and the invoice mirror are both REBUILDABLE (a customer is
-- re-ensured at next checkout; the mirror refills from Stripe's own events),
-- so this recreates rather than migrates rows keyed by ids that no longer
-- exist. The accounts table — the one unrecoverable thing — is untouched.
DROP TABLE IF EXISTS stripe_customers;
CREATE TABLE stripe_customers (
  person_id   TEXT NOT NULL,
  studio_id   TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The same human at two studios is two customers, because they are two
  -- merchants — so the pair is the key, not the person alone.
  PRIMARY KEY (studio_id, person_id),
  UNIQUE (account_id, customer_id)
);

ALTER TABLE stripe_invoices RENAME COLUMN membership_id TO subscription_id;

-- Down Migration

ALTER TABLE stripe_invoices RENAME COLUMN subscription_id TO membership_id;
DROP TABLE IF EXISTS stripe_customers;
CREATE TABLE stripe_customers (
  membership_id TEXT PRIMARY KEY,
  studio_id     TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, customer_id)
);

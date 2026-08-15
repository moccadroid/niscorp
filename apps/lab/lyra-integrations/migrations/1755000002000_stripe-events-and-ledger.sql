-- Up Migration

-- EVERY EVENT, ONCE.
--
-- Stripe redelivers. A webhook that answers slowly, or answers 500, or answers
-- fine while the network disagrees, is sent again — so "did we already do this?"
-- is not an edge case, it is the normal operating condition.
--
-- The primary key is Stripe's own event id, so the answer is an INSERT that
-- either wins or loses. Not a SELECT-then-INSERT, which is the same question
-- asked with a race in the middle: two deliveries arriving together would both
-- read "no" and both act.
--
-- Kept after processing rather than deleted. An event that arrived is a thing
-- that happened, and the first question anybody asks about a payment that went
-- wrong is what this service was told and when.
CREATE TABLE stripe_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  account_id   TEXT NOT NULL DEFAULT '',
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- What we did about it, in a word: applied, ignored, or the failure. A
  -- redelivery of something that failed should be retried, which is why the
  -- outcome is here and not implied by the row existing.
  outcome      TEXT NOT NULL DEFAULT 'received',
  detail       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX stripe_events_received ON stripe_events (received_at DESC);

-- THE LEDGER MIRROR (S4).
--
-- Lyra's subscription row holds STANDING — active, and how far the money
-- reaches. It never learns a Stripe id. Everything else about the money —
-- individual invoices, what was refunded, what is disputed — is this service's
-- own mirror, surfaced through the integration's own screens.
--
-- That split is what makes cash at the desk and a second provider the same
-- change: they write the same standing through the same mutation, and neither
-- has to reproduce an invoice history that was never lyra's.
--
-- A MIRROR, not a source. Stripe is the truth; this is what we were told, kept
-- so a studio can read its own money without this service calling a vendor on
-- every page load. Anything disagreeing with Stripe is this table being stale,
-- and the fix is a redelivery rather than a reconciliation.
CREATE TABLE stripe_invoices (
  invoice_id     TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,
  studio_id      TEXT NOT NULL,
  membership_id  TEXT NOT NULL DEFAULT '',
  -- Stripe's own words: paid · open · uncollectible · void.
  status         TEXT NOT NULL,
  amount_cents   INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL,
  disputed       BOOLEAN NOT NULL DEFAULT false,
  invoiced_on    DATE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stripe_invoices_studio ON stripe_invoices (studio_id, invoiced_on DESC);

-- Down Migration

DROP TABLE IF EXISTS stripe_invoices;
DROP TABLE IF EXISTS stripe_events;

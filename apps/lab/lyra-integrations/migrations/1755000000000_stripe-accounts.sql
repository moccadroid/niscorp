-- Up Migration

-- WHICH STUDIO OWNS WHICH CONNECTED ACCOUNT.
--
-- The one fact in this service that cannot be regenerated. Stripe mints
-- `acct_…` once, keeps it forever, and there is no way to ask "which of my
-- studios is this?" from their side — so if this mapping is lost, the account is
-- live, billable, and unreachable.
--
-- PREFIXED `stripe_` because every integration in this service shares one
-- database. The prefix is the boundary: integration-check asserts an
-- integration's SQL never names a table outside its own, which TypeScript
-- cannot say and a convention would not keep.
CREATE TABLE stripe_accounts (
  studio_id    TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL UNIQUE,
  -- What the studio was called when it onboarded. For an operator reading this
  -- table directly, which is the only way anybody reads it.
  studio_name  TEXT NOT NULL DEFAULT '',
  -- ISO-3166 alpha-2, as it was at creation. Stripe fixes the country on the
  -- account object and it cannot be moved afterwards, so this records what was
  -- actually asked for rather than what the studio says today.
  country      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ONE ACCOUNT PER STUDIO, and the primary key is what says so. Creating a
-- second is not a duplicate row, it is a second live merchant account at a
-- vendor — the dashboard type is immutable, so the first cannot be repaired
-- into the second. The database refuses rather than the handler remembering to.

-- Down Migration

DROP TABLE IF EXISTS stripe_accounts;

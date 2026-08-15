-- Up Migration

-- WHICH PROVIDER SUBSCRIPTION IS WHICH MEMBERSHIP.
--
-- Everything this integration does was one-directional: lyra's ids ride the
-- metadata to Stripe, and a webhook arrives already holding the membership it is
-- about. Nothing ever needed the reverse.
--
-- Giving notice does. A member leaves in lyra, the trigger computes the day, and
-- somebody has to tell Stripe to stop on that day — which means naming the
-- Stripe subscription, from a lyra subscription id, with no event in hand.
--
-- A CACHE, not a source. Every row here is derivable from Stripe: each
-- subscription there carries the metadata this was built from, so losing this
-- table costs a re-sync and not a fact.
CREATE TABLE stripe_subscriptions (
  studio_id              TEXT NOT NULL,
  -- Lyra's subscription id — the same key `subscriptions/assert` is keyed on.
  subscription_id        TEXT NOT NULL,
  account_id             TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, subscription_id)
);

CREATE INDEX stripe_subscriptions_account ON stripe_subscriptions (account_id);

-- Down Migration

DROP TABLE IF EXISTS stripe_subscriptions;

-- Up Migration

-- A PERIOD IS A PAIR, and this column is the half that was missing.
--
-- The price map is content-addressed: ask for the same (account, amount,
-- currency, interval) twice and get the same Stripe Price back. That held while
-- lyra could only say "monthly" or "yearly" — and the day it learned to say
-- "every three months", €240 monthly and €240 quarterly became the same four
-- fields. They would have addressed ONE Price, and every quarterly subscriber
-- would have been billed monthly, silently, with the mirror agreeing.
--
-- Existing rows are all count 1: that is what the four old spellings meant.
-- The KEY changes shape, though, so old keys no longer match what `priceKey`
-- computes — which is harmless by design. A key that does not match is a Price
-- that gets created once more at the next checkout, and the orphan is a spare
-- object at a vendor rather than a wrong charge.
ALTER TABLE stripe_prices ADD COLUMN IF NOT EXISTS interval_count INTEGER NOT NULL DEFAULT 1;

-- Down Migration

ALTER TABLE stripe_prices DROP COLUMN IF EXISTS interval_count;

-- Up Migration

-- THE DOCUMENT, not just the amount.
--
-- The mirror recorded what was charged and never where the invoice IS. A studio
-- asked for a copy and there was nothing to hand over; a member asked and the
-- answer was "ask Stripe", which is precisely the trip S1 said a studio would
-- never have to make.
--
-- Stripe issues these — numbered, sequenced, under the studio's own identity —
-- and that is the right place for them to come from. §11 UStG sequential
-- numbering is not something two systems should both believe they own, so this
-- holds a POINTER and nothing else: no number of our own, no PDF of our own, no
-- second opinion about what the invoice says.
ALTER TABLE stripe_invoices ADD COLUMN IF NOT EXISTS hosted_url TEXT NOT NULL DEFAULT '';
ALTER TABLE stripe_invoices ADD COLUMN IF NOT EXISTS pdf_url    TEXT NOT NULL DEFAULT '';

-- Down Migration

ALTER TABLE stripe_invoices DROP COLUMN IF EXISTS hosted_url;
ALTER TABLE stripe_invoices DROP COLUMN IF EXISTS pdf_url;

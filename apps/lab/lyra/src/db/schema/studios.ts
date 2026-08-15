// The tenant: a studio, and the clock every date in this schema is stamped from.
export const STUDIOS_DDL = /* sql */ `
  -- A studio. "theme" names the row in "themes" this studio wears; NULL means
  -- the stock look. "slug" is what a future public URL would use.
  CREATE TABLE studios (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL,            -- yoga | bjj | dance | pilates | gym | ...
    timezone    TEXT NOT NULL DEFAULT 'UTC',
    -- WHAT THIS STUDIO CHARGES IN. One currency, and the money tables point at
    -- this pair rather than carrying an opinion of their own — see the composite
    -- keys below. A studio that changes it has to move every price in the same
    -- statement, which is correct: a price list half in one currency is not a
    -- price list.
    currency    TEXT NOT NULL DEFAULT 'EUR',
    -- WHERE THIS STUDIO TRADES, as ISO-3166 alpha-2.
    --
    -- It decides more than an address: which payment methods a member is offered
    -- (SEPA against a card), which verification a payment provider asks the
    -- studio for, and which consumer law the contract sits under. It was a
    -- constant in the payments integration, which is fine for one country and wrong the
    -- first time somebody signs up from anywhere else.
    country     TEXT NOT NULL DEFAULT 'AT' CHECK (country ~ '^[A-Z]{2}$'),
    -- WHAT KIND OF BUSINESS THIS STUDIO IS.
    --
    -- A company or a sole trader — GmbH or Einzelunternehmen — and the
    -- difference is not cosmetic: it decides which verification documents a
    -- payment provider demands, and on a merchant account it is close to
    -- irreversible. It was a constant in the payments integration, which is
    -- right for one studio and wrong for the first one that is not a company.
    --
    -- The owner says which; nobody guesses for them. The default is what the
    -- constant used to be, so no existing studio changes by this arriving.
    legal_form  TEXT NOT NULL DEFAULT 'company' CHECK (legal_form IN ('company', 'individual')),
    -- WHAT LANGUAGE THIS STUDIO READS IN, as a BCP-47 tag.
    --
    -- Sits beside "country" and "currency" rather than on a person, and that
    -- is a decision worth stating: language is the more personal of the two,
    -- but a studio is where the shared surface lives — the desk screen two
    -- people share, the words on a member's notice. Per-person is the obvious
    -- next move and needs only a second column and a COALESCE here.
    --
    -- The full tag matters. "de-AT" writes "€ 45,00" where "de-DE" writes
    -- "45,00 €" and "de-CH" writes "EUR 45.00" — three countries, one
    -- language, three answers, and a bare "de" would silently pick one.
    locale      TEXT NOT NULL DEFAULT 'en-GB' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    -- WHERE A REPLY GOES, and the first contact detail this table has ever
    -- carried. Every studio sends from one shared, verified deployment domain
    -- wearing its OWN name — "Lumen Yoga" <lumen@mail.lyra.app> — so the member
    -- sees who it is from; this is what makes a reply reach the studio rather
    -- than us. Empty means a member's reply bounces, which is why the studio
    -- settings screen asks for it.
    reply_to    TEXT NOT NULL DEFAULT '',
    -- A CEILING, NOT A BUDGET. It exists so one studio's mistake — a bad
    -- import, an automation pointed at the whole roll — cannot spend the shared
    -- sending domain's reputation on everybody else's behalf before anybody
    -- notices. A studio of three hundred sending one broadcast spends three
    -- hundred; a thousand is generous for a day's honest work and cheap to
    -- raise, which is why it is a column and not a constant.
    daily_mail_cap INTEGER NOT NULL DEFAULT 1000 CHECK (daily_mail_cap >= 0),
    -- ── BRING YOUR OWN DOMAIN ────────────────────────────────
    -- Empty means the shared deployment domain, which is what every studio
    -- sends from until it decides otherwise. Verified is the PROVIDER'S word
    -- rather than ours: a domain whose DNS has not landed sends nothing, so
    -- until it flips the shared sender stays in use and nothing breaks.
    sending_domain      TEXT NOT NULL DEFAULT '',
    sending_domain_id   TEXT NOT NULL DEFAULT '',
    sending_domain_ok   BOOLEAN NOT NULL DEFAULT false,
    theme_id    TEXT REFERENCES themes(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Redundant as a constraint — "id" is already unique — and load-bearing as a
    -- TARGET: it is what lets a plan reference (studio, currency) as a pair.
    UNIQUE (id, currency)
  );

  -- STABLE, not IMMUTABLE, because it reads now(). Stable lets Postgres call it
  -- once per statement, which is what makes it safe inside a trigger: the day
  -- cannot change halfway through generating a term of classes.
  CREATE FUNCTION studio_today(studio TEXT) RETURNS DATE AS $tz$
    SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM studios WHERE id = studio), 'UTC'))::date;
  $tz$ LANGUAGE sql STABLE;
`;

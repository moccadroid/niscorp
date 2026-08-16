// What the studio decided to say, to which of its people, and what came of it.
export const CAMPAIGNS_DDL = /* sql */ `
  -- ── THE QUESTIONS A STUDIO MAY ASK OF ITS OWN ROLL ──────────
  --
  -- THE PRESENTATION HALF OF A CODE CONSTANT, PROJECTED AS ROWS — the same
  -- deal the automation vocabulary makes, for the same two reasons.
  --
  -- The behaviour cannot live here: an audience IS a vex entry plus a lens
  -- value, and entries are code. What CAN live here is everything a screen
  -- says about one — its phrase, its blurb, whether it takes a window — and
  -- putting that in rows is what makes the compose sheet's dropdown a QUERY
  -- rather than a list some screen holds a second copy of.
  --
  -- The FOREIGN KEY from a campaign is the other reason, and it is the one
  -- that bites: an audience is what decides who a message reaches, so a row
  -- naming a question no release has must not be storable at all. It is
  -- refused here rather than discovered by a fan-out that selects nobody.
  CREATE TABLE campaign_audiences (
    id       TEXT PRIMARY KEY,
    phrase   TEXT NOT NULL,
    blurb    TEXT NOT NULL,
    -- DOES THE QUESTION NEED A WINDOW — "gone quiet" is meaningless without
    -- "since when", "everyone on trial" would be lied to by one. A boolean
    -- rather than a nullable default because the screen asks a different
    -- question, not the same question with a hole in it.
    windowed BOOLEAN NOT NULL DEFAULT false,
    sort     INTEGER NOT NULL DEFAULT 0
  );

  -- ── A CAMPAIGN ──────────────────────────────────────────────
  --
  -- WHAT A HUMAN WRITES WHEN THEY PRESS SEND, and the whole of it. No mail is
  -- queued here: a reflex reads this row as the studio's own machinery and
  -- turns it into outbox rows (reflexes/compose.ts). That is not indirection
  -- for its own sake — it is what keeps the charter's sentence true, that
  -- \`outbox\` is the one table in this app no human ever writes, and it is
  -- what lets the consent question be asked at the moment of WRITING rather
  -- than trusted from a screen somebody left open for ninety seconds.
  CREATE TABLE campaigns (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id    TEXT NOT NULL REFERENCES studios(id),
    -- WHO THIS WENT TO, AS THE QUESTION THAT WAS ASKED — never as a list of
    -- names. A recipient list cannot be assembled from a roll that pages at
    -- fifty, it is the same fact as the outbox rows a moment later, and the
    -- copy that is not load-bearing drifts. The question is also what the
    -- owner needs to READ on the campaigns screen to know what they did.
    audience      TEXT NOT NULL REFERENCES campaign_audiences(id),
    -- The window, when the audience takes one. A column rather than a bag of
    -- parameters, for the reason automations.days is one: there is exactly one
    -- parameter any of these questions takes, and a JSON blob holding a single
    -- integer is a schema nobody can read.
    audience_days INTEGER NOT NULL DEFAULT 0,
    -- WHO THE OWNER STRUCK OFF BY HAND. Subtraction from a question, never the
    -- way one is assembled: this is how "everybody on trial, but not him" is
    -- sayable, and it stays a handful of ids rather than becoming the
    -- recipient list by the back door. Empty is the ordinary case.
    excluded      JSONB NOT NULL DEFAULT '[]'::jsonb,
    subject       TEXT NOT NULL,
    -- Stage 0: the body is text. Stage 1 adds \`layout JSONB\` beside it and
    -- the text becomes the fallback part. Never a third column after that.
    body          TEXT NOT NULL DEFAULT '',
    -- 'sending' IS WHAT THE FAN-OUT REFLEX ARMS ON. 'draft' wakes nothing and
    -- exists for the editor; 'refused' is the daily cap saying no BEFORE any
    -- mail exists, with its reason in words beside it — the outbox's own
    -- posture, where a failure is a value somebody can read rather than a
    -- crash or a silence.
    state          TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'sending', 'sent', 'refused')),
    refused_reason TEXT NOT NULL DEFAULT '',
    queued_count   INTEGER NOT NULL DEFAULT 0,
    sent_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX campaigns_studio ON campaigns (studio_id, created_at DESC);
`;

// The vocabulary an automation is built from, and the automations themselves.
export const AUTOMATIONS_DDL = /* sql */ `
  -- THE PRESENTATION HALF OF A CODE CONSTANT, PROJECTED AS ROWS.
  --
  -- A moment's behaviour cannot live here: its "watch" anchor and its
  -- "context" are functions, and code stays their only home. What CAN live
  -- here is everything a screen says about it — the phrase, the blurb,
  -- whether the number means anything — and putting that in rows is what
  -- lets an ordinary vex entry compose a card's whole sentence in its
  -- mapping, instead of a function fetching rows and captioning them in JS.
  -- The projection is refreshed at boot from the shipped constants, the way
  -- the directory is (see the seed's "vocabulary" block).
  --
  -- The FOREIGN KEYS are the second reason. "moment" and "effect" were free
  -- text, so a row could name a pairing no release has and nothing objected
  -- until a card rendered "This pairing is not in this version". The
  -- database refuses it now.
  CREATE TABLE automation_moments (
    id         TEXT PRIMARY KEY,
    phrase     TEXT NOT NULL,
    blurb      TEXT NOT NULL,
    -- Written (a fact wakes it) rather than clocked. A watched row has no
    -- hour, and one claiming an hour it ignores would be lying.
    watched    BOOLEAN NOT NULL DEFAULT false,
    days_label TEXT NOT NULL DEFAULT '',
    sort       INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE automation_effects (
    id            TEXT PRIMARY KEY,
    phrase        TEXT NOT NULL,
    blurb         TEXT NOT NULL,
    subject_label TEXT NOT NULL DEFAULT '',
    body_label    TEXT NOT NULL DEFAULT '',
    message_hint  TEXT NOT NULL DEFAULT '',
    sort          INTEGER NOT NULL DEFAULT 0
  );

  -- Nobody builds an automation from an empty form — they recognise a
  -- problem they have. A recipe is a pre-filled pairing, and it is a row for
  -- the same reason the moments are: so the screen that offers it can be a
  -- query, and "does this studio already run it" can be a join rather than a
  -- map built in a function.
  CREATE TABLE automation_recipes (
    id      TEXT PRIMARY KEY,
    title   TEXT NOT NULL,
    why     TEXT NOT NULL,
    icon    TEXT NOT NULL DEFAULT '',
    moment  TEXT NOT NULL REFERENCES automation_moments(id),
    effect  TEXT NOT NULL REFERENCES automation_effects(id),
    run_at  TEXT NOT NULL DEFAULT '09:00',
    days    INTEGER NOT NULL DEFAULT 7,
    subject TEXT NOT NULL DEFAULT '',
    body    TEXT NOT NULL DEFAULT '',
    sort    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE automations (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id    TEXT NOT NULL REFERENCES studios(id),
    moment       TEXT NOT NULL REFERENCES automation_moments(id),
    effect       TEXT NOT NULL REFERENCES automation_effects(id),
    enabled      BOOLEAN NOT NULL DEFAULT true,
    run_at       TEXT NOT NULL DEFAULT '09:00',
    days         INTEGER NOT NULL DEFAULT 7,
    -- Authored by the studio, because the wording of a message to their own
    -- members is theirs.
    subject      TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',
    -- HOW IT LAST RAN, mirrored from the engine's own ledger by a trigger
    -- (see wireRunMirror in boot.ts) — the counter-cache this schema uses for
    -- booked seats and the anchor's relationships. The card needs one line
    -- per automation and the ledger is keyed by a COMPOSED reflex id, which
    -- is a join no declared foreign key can carry; recomputing it is what
    -- the trigger is for, and reading it is then an ordinary column.
    last_run_state  TEXT NOT NULL DEFAULT '',
    last_run_done   INTEGER NOT NULL DEFAULT 0,
    last_run_failed INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One pairing per studio. Two rows over the same moment doing different
    -- things differ by effect, so this does not stand in the way.
    UNIQUE (studio_id, moment, effect)
  );

  CREATE INDEX automations_studio ON automations (studio_id);
`;

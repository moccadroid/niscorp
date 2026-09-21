// Encore's Postgres schema, run once against PGlite at boot.
//
// Three kinds of table, and the difference matters to the intent loop:
//
//   THE BILL     — stages, acts, slots. What is supposed to happen. `slots` is
//                  the running order and the only one of these anybody edits.
//   THE SITE     — zones, gates, crew. Where things are and who is on them.
//   THE READINGS — weather_hours, zone_counts, sales_hourly, incidents. What is
//                  actually happening, hour by hour. Nobody writes these from a
//                  screen; they are the fixture's instruments.
//   THE LEDGER   — delays, pushes. What the ops tent DID. Insert-only, stamped
//                  with who did it by the engine, never by the form.
//   THE THREAD   — agent_turns. What was SAID, and what either speed made of
//                  it: the text model's memory, as rows (DESIGN.md).
//
// Vex introspects this DDL to compile the authored queries, so the foreign keys
// are load-bearing: `slots → acts` and `slots → stages` are the joins every
// running-order read rides.
//
// `label` and `search` are GENERATED. A candidate row leaves the process as a
// label — a name plus one disambiguator — and is found by a lowercase search
// document. Both are derivations of columns already here, so the database
// derives them; a seed that spelled them out would be one fact in three places.

export const DDL = /* sql */ `
  -- What vex's fuzzy filter compiles to is the pg_trgm % operator. The
  -- extension is loaded into PGlite by the runtime; this switches it on.
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  -- ─── the site ────────────────────────────────────────────────

  -- x/y/w/h are map geometry on a 100 × 60 grid: the site plan is data, so the
  -- map primitive stays a rectangle-drawer that has never heard of a festival.
  CREATE TABLE zones (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    kind      TEXT NOT NULL,
    -- NUMERIC, not INTEGER: fill is headcount / capacity, computed in the
    -- query, and integer division in Postgres is 0 for every zone under full.
    capacity  NUMERIC NOT NULL,
    x         INTEGER NOT NULL,
    y         INTEGER NOT NULL,
    w         INTEGER NOT NULL,
    h         INTEGER NOT NULL,
    label     TEXT GENERATED ALWAYS AS (name || ' — ' || kind) STORED,
    search    TEXT GENERATED ALWAYS AS (lower(name || ' ' || kind)) STORED
  );

  CREATE TABLE gates (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    zone_id            TEXT NOT NULL REFERENCES zones(id),
    capacity_per_hour  INTEGER NOT NULL,
    is_open            BOOLEAN NOT NULL DEFAULT true,
    -- The scanners at a gate can fail while the gate stays open: the queue then
    -- has nowhere to go. A reading, flipped by the feed (scene 4).
    scanner_ok         BOOLEAN NOT NULL DEFAULT true,
    rev                BIGINT NOT NULL DEFAULT 0
  );

  CREATE TABLE crew (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    role      TEXT NOT NULL,
    zone_id   TEXT NOT NULL REFERENCES zones(id),
    on_shift  BOOLEAN NOT NULL DEFAULT true,
    label     TEXT GENERATED ALWAYS AS (name || ' — ' || role) STORED,
    search    TEXT GENERATED ALWAYS AS (lower(name || ' ' || role)) STORED
  );

  -- ─── the bill ────────────────────────────────────────────────

  CREATE TABLE stages (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    kind      TEXT NOT NULL,
    capacity  NUMERIC NOT NULL,
    zone_id   TEXT NOT NULL REFERENCES zones(id),
    label     TEXT GENERATED ALWAYS AS (name || ' — ' || kind || ' stage') STORED,
    search    TEXT GENERATED ALWAYS AS (lower(name || ' ' || kind)) STORED
  );

  -- billing is the word an operator actually says: nobody in an ops tent calls
  -- the Saturday closer by name when the radar turns red.
  CREATE TABLE acts (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    billing   TEXT NOT NULL,
    genre     TEXT NOT NULL,
    draw      INTEGER NOT NULL,
    label     TEXT GENERATED ALWAYS AS (name || ' — ' || billing || ', ' || genre) STORED,
    search    TEXT GENERATED ALWAYS AS (lower(name || ' ' || billing || ' ' || genre)) STORED
  );

  -- One set. starts_at is the canonical time, as the text a stage manager reads
  -- ('21:30'); the minute columns are its geometry, generated, so a swap that
  -- rewrites starts_at moves the bar on the timeline without a second write.
  -- Nothing runs past midnight — the licence says 23:45 — which is what lets a
  -- time be one number.
  CREATE TABLE slots (
    id            TEXT PRIMARY KEY,
    act_id        TEXT NOT NULL REFERENCES acts(id),
    stage_id      TEXT NOT NULL REFERENCES stages(id),
    day           TEXT NOT NULL CHECK (day IN ('fri', 'sat', 'sun')),
    starts_at     TEXT NOT NULL,
    duration_min  INTEGER NOT NULL,
    start_min     INTEGER GENERATED ALWAYS AS (split_part(starts_at, ':', 1)::int * 60 + split_part(starts_at, ':', 2)::int) STORED,
    end_min       INTEGER GENERATED ALWAYS AS (split_part(starts_at, ':', 1)::int * 60 + split_part(starts_at, ':', 2)::int + duration_min) STORED,
    -- EXPOSURE: the worst weather severity that overlaps this set on a stage
    -- with no roof, 0 when it is under cover or the sky is clear. It is a fact
    -- about two other tables, so a generated column cannot hold it; the trigger
    -- below keeps it, which means a swap that moves a set under cover clears it
    -- in the same write and every read of the running order simply sees a
    -- column. (A view would say the same thing and vex introspects tables only.)
    exposure      INTEGER NOT NULL DEFAULT 0
  );

  -- ─── the readings ────────────────────────────────────────────

  -- severity 0–3. The Saturday 21:00 row is the storm cell the whole demo is
  -- typed at.
  CREATE TABLE weather_hours (
    id         TEXT PRIMARY KEY,
    day        TEXT NOT NULL,
    hour       INTEGER NOT NULL,
    condition  TEXT NOT NULL,
    rain_mm    NUMERIC NOT NULL,
    wind_kph   INTEGER NOT NULL,
    severity   INTEGER NOT NULL
  );

  -- Kept on every insert and every move. BEFORE the row is written, so the
  -- generated minute columns do not exist yet: the window is computed from the
  -- same two columns they are.
  CREATE FUNCTION slot_exposure() RETURNS trigger AS $$
  DECLARE
    from_min INTEGER := split_part(NEW.starts_at, ':', 1)::int * 60 + split_part(NEW.starts_at, ':', 2)::int;
  BEGIN
    NEW.exposure := COALESCE((
      SELECT max(w.severity)
      FROM weather_hours w
      JOIN stages st ON st.id = NEW.stage_id
      WHERE st.kind <> 'covered'
        AND w.day = NEW.day
        AND w.severity >= 1
        AND w.hour * 60 < from_min + NEW.duration_min
        AND (w.hour + 1) * 60 > from_min
    ), 0);
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER slots_exposure BEFORE INSERT OR UPDATE ON slots FOR EACH ROW EXECUTE FUNCTION slot_exposure();

  CREATE TABLE zone_counts (
    id         TEXT PRIMARY KEY,
    zone_id    TEXT NOT NULL REFERENCES zones(id),
    day        TEXT NOT NULL,
    hour       INTEGER NOT NULL,
    headcount  INTEGER NOT NULL,
    rev        BIGINT NOT NULL DEFAULT 0
  );

  -- Tickets scanned at a gate, a row per scanner batch. The noisiest feed on the
  -- site and nearly always routine: what the event pass exists to say "nothing"
  -- about, three hundred times a minute, as ONE state.
  CREATE TABLE gate_scans (
    id       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    gate_id  TEXT NOT NULL REFERENCES gates(id),
    day      TEXT NOT NULL,
    minute   INTEGER NOT NULL,
    scans    INTEGER NOT NULL,
    rev      BIGINT NOT NULL DEFAULT 0
  );

  -- THE FESTIVAL CLOCK, as a row. One of them. It was a constant while the room
  -- only answered sentences; a room that watches needs time to pass, and time
  -- passing is a write like any other — so whoever advances it (a director
  -- today, a wall clock one day) enters by the same door as every other feed.
  CREATE TABLE festival_clock (
    id      TEXT PRIMARY KEY,
    day     TEXT NOT NULL CHECK (day IN ('fri', 'sat', 'sun')),
    minute  INTEGER NOT NULL CHECK (minute >= 0 AND minute < 1440)
  );

  CREATE TABLE sales_hourly (
    id       TEXT PRIMARY KEY,
    day      TEXT NOT NULL,
    hour     INTEGER NOT NULL,
    kind     TEXT NOT NULL CHECK (kind IN ('tickets', 'bar')),
    units    INTEGER NOT NULL,
    revenue  NUMERIC NOT NULL
  );

  CREATE TABLE incidents (
    id        TEXT PRIMARY KEY,
    day       TEXT NOT NULL,
    at        TEXT NOT NULL,
    zone_id   TEXT NOT NULL REFERENCES zones(id),
    kind      TEXT NOT NULL,
    severity  INTEGER NOT NULL,
    summary   TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'open',
    rev       BIGINT NOT NULL DEFAULT 0
  );

  -- WHAT CHANGED SINCE I LAST LOOKED? — one counter for every feed. A reaction
  -- says THAT a table was written and carries no rows (moss, by design), so a
  -- watcher re-reads under its own policy: "rows of this table with rev above my
  -- cursor". An insert OR an update stamps the next value, so a closed incident
  -- and a drained zone come back round exactly like a new one.
  CREATE SEQUENCE feed_rev;
  CREATE FUNCTION stamp_rev() RETURNS trigger AS $$
  BEGIN
    NEW.rev := nextval('feed_rev');
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  CREATE TRIGGER incidents_rev BEFORE INSERT OR UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION stamp_rev();
  CREATE TRIGGER zone_counts_rev BEFORE INSERT OR UPDATE ON zone_counts FOR EACH ROW EXECUTE FUNCTION stamp_rev();
  CREATE TRIGGER gates_rev BEFORE INSERT OR UPDATE ON gates FOR EACH ROW EXECUTE FUNCTION stamp_rev();
  CREATE TRIGGER gate_scans_rev BEFORE INSERT OR UPDATE ON gate_scans FOR EACH ROW EXECUTE FUNCTION stamp_rev();

  -- ─── the ledger ──────────────────────────────────────────────
  -- created_by has no default and no form field: the engine stamps it from the
  -- session (vex/behaviors.ts), so a row here says who pressed the button and
  -- no request body can say otherwise.

  CREATE TABLE delays (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    act_id      TEXT NOT NULL REFERENCES acts(id),
    minutes     INTEGER NOT NULL,
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ─── the thread ──────────────────────────────────────────────
  -- One row per thing said or done in a conversation with the room: the
  -- operator's settled line, what the fast model made of it alone, the text
  -- model's answer, or a break (the operator started a new thread). The principal
  -- is stamped by the engine and is also the read fence: a thread belongs to
  -- one person. seq orders it; wall-clock time would tie inside a millisecond.
  -- ─── the calibration record ──────────────────────────────────
  -- A card the room raised by itself, and what a PERSON then did about it: kept
  -- it or dismissed it. Stored with the probabilities of the pass that raised
  -- the card, so "does 0.8 mean four in five?" is measured per question, from
  -- the operator's own hand (PLAN.md § The loop). Written only by a click —
  -- through the card's own endpoint, stamped with who clicked by the engine.
  CREATE TABLE attention_labels (
    seq            BIGSERIAL PRIMARY KEY,
    principal      TEXT NOT NULL,
    verdict        TEXT NOT NULL CHECK (verdict IN ('kept', 'dismissed')),
    action_id      TEXT NOT NULL,
    cause          TEXT NOT NULL,
    probabilities  TEXT NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE agent_turns (
    seq         BIGSERIAL PRIMARY KEY,
    principal   TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('operator', 'jev', 'agent', 'did', 'event', 'break')),
    body        TEXT NOT NULL,
    -- What was made of the line, as JSON text: route, rows resolved, cards
    -- opened and what they were aimed at. Read by one mapper, never queried.
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE pushes (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    audience    TEXT NOT NULL,
    urgency     INTEGER NOT NULL,
    body        TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

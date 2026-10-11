import type { Sequence } from '@niscorp/strata';

// One table per guarantee. `tide_run` and `tide_work` are the two that grow
// with events; `tide_fact` is the intake, swept on its own horizon; and
// `tide_reflex_state` holds one row per reflex, forever.
//
// The CHECK constraints are not decoration. The last hand-written store read
// state back through a blind cast, so a run whose state was `'sttled'` was
// constructible — and its work was never claimed and it hung there.
export const TIDE_TABLES = ['tide_fact', 'tide_run', 'tide_work', 'tide_reflex_state'] as const;

// HISTORY. This text is migration 1 of `nisc.moss.tide` (TIDE_SEQUENCE below),
// and databases have run it: editing it makes every one of them refuse to boot
// (strata: EDITED). Change the tables by appending a migration to the sequence;
// test/baselines.test.ts pins this one's checksum so the edit is caught here.
export const TIDE_DDL = `
CREATE TABLE IF NOT EXISTS tide_fact (
  id           text PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('write','signal','manual','run')),
  entity       text,
  op           text CHECK (op IN ('insert','update','delete')),
  row          jsonb,
  name         text,
  payload      jsonb,
  reflex       text,
  run_id       text,
  occurrence   text,
  stats        jsonb,
  target       text,
  by           text,
  at           bigint NOT NULL,
  not_before   bigint,
  dedupe_key   text,
  cause        text,
  depth        integer NOT NULL DEFAULT 0,
  delivered_at bigint,
  parked       text,
  released     boolean,
  -- WHOSE FACT THIS IS. The identity of the reflex that minted it, absent on
  -- anything the host ingested. The matcher refuses to hand a fact minted
  -- under one identity to a reflex running under another, which is the only
  -- thing standing between a carried row and somebody else's effect — tide is
  -- the one place a row travels without being read, so no scope policy is
  -- consulted on the way.
  as_who       text
);

-- A PARTIAL index, because a fact with no dedupeKey is not claiming to be
-- unique: it is a distinct occurrence of something, not a repeat of it.
-- entity is in the key: without it, two producers over different tables
-- that agreed on a key value silently ate each other's rows.
CREATE UNIQUE INDEX IF NOT EXISTS tide_fact_dedupe
  ON tide_fact (kind, coalesce(entity,''), coalesce(name,''), dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- The matcher's query, every advance.
CREATE INDEX IF NOT EXISTS tide_fact_due
  ON tide_fact (at) WHERE delivered_at IS NULL AND parked IS NULL;
CREATE INDEX IF NOT EXISTS tide_fact_swept ON tide_fact (delivered_at);

CREATE TABLE IF NOT EXISTS tide_run (
  id         text PRIMARY KEY,
  reflex_id  text NOT NULL,
  version    text NOT NULL,
  as_who     text,
  cause      text NOT NULL,
  occurrence text,
  fact_ids   jsonb,
  state      text NOT NULL CHECK (state IN ('pending','fanned','settled','skipped')),
  depth      integer NOT NULL DEFAULT 0,
  selected   integer,
  total      integer NOT NULL DEFAULT 0,
  done       integer NOT NULL DEFAULT 0,
  failed     integer NOT NULL DEFAULT 0,
  due_at     bigint NOT NULL,
  created_at bigint NOT NULL,
  settled_at bigint,
  drained    boolean,
  note       text,
  -- THE IDEMPOTENCY. One constraint, every trigger kind: an occurrence
  -- cannot open twice, a replayed fact cannot open twice, and two instances
  -- ticking at the same moment contend instead of duplicating.
  UNIQUE (reflex_id, cause)
);

CREATE INDEX IF NOT EXISTS tide_run_pending ON tide_run (state, due_at);
CREATE INDEX IF NOT EXISTS tide_run_ledger ON tide_run (reflex_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tide_run_swept ON tide_run (settled_at);

CREATE TABLE IF NOT EXISTS tide_work (
  id            text PRIMARY KEY,
  -- ON DELETE CASCADE, because a run and its work are one fact about the
  -- world. Sweeping runs and leaving work destroys the UNIQUE(run_id, unit)
  -- row that IS the "this unit already ran" record — and a restore then
  -- re-charges the invoice.
  run_id        text NOT NULL REFERENCES tide_run(id) ON DELETE CASCADE,
  reflex_id     text NOT NULL,
  unit          text NOT NULL,
  cause         text NOT NULL,
  env           jsonb NOT NULL,
  depth         integer NOT NULL DEFAULT 0,
  state         text NOT NULL CHECK (state IN ('pending','claimed','retrying','done','failed')),
  attempt       integer NOT NULL DEFAULT 0,
  token         text,
  -- Zero, never null, when unclaimed: "never claimed or lapsed" is then one
  -- comparison rather than a disjunction.
  claimed_until bigint NOT NULL DEFAULT 0,
  not_before    bigint NOT NULL,
  input         jsonb,
  output        jsonb,
  error         text,
  created_at    bigint NOT NULL,
  settled_at    bigint,
  UNIQUE (run_id, unit)
);

CREATE INDEX IF NOT EXISTS tide_work_claimable ON tide_work (state, not_before, claimed_until);
CREATE INDEX IF NOT EXISTS tide_work_run ON tide_work (run_id);
CREATE INDEX IF NOT EXISTS tide_work_swept ON tide_work (settled_at);

CREATE TABLE IF NOT EXISTS tide_reflex_state (
  reflex_id             text PRIMARY KEY,
  armed_at              bigint NOT NULL DEFAULT 0,
  materialized_through  bigint
);

-- Polls are gone (the vex bridge pushes writes — a poll could only
-- re-discover them late), and their cursor state goes with them. IF EXISTS,
-- so a store created after the removal is not asked to drop what it never had.
ALTER TABLE tide_reflex_state DROP COLUMN IF EXISTS poll_cursor;
ALTER TABLE tide_reflex_state DROP COLUMN IF EXISTS poll_seen;
ALTER TABLE tide_reflex_state DROP COLUMN IF EXISTS polled_at;
`;

// One statement per step — a prepared statement carries exactly one command
// (PGlite says so outright; `pg` under parameters too). The comments ride
// along: strata hashes a step without its full-line comments, so rewording
// one is not an edit.
//
// SPLIT ON EVERY `;`, AND FOR MIGRATION 1 ONLY. That is not how a sequence is
// split: a `;` inside a statement would cut it in two, and a new sequence uses
// strata's `sqlSteps` (nisc AGENTS.md, rule 17). It cannot be corrected here.
// The sixteen steps this makes of TIDE_DDL have run, their checksum is in
// every ledger, and a different split is a different history. TIDE_DDL holds
// sixteen `;`, each the end of a statement. Nothing new is split this way.
const statementsOf = (ddl: string): { kind: 'sql'; sql: string }[] =>
  ddl
    .split(';')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.split('\n').some((line) => line.trim() !== '' && !line.trim().startsWith('--')))
    .map((sql) => ({ kind: 'sql', sql }));

// THE ID SAYS `moss`, AND STAYS. The sequence was named when this store was in
// moss, and every ledger that has run it holds its rows under that name. Under
// another id it would be a sequence no ledger has seen.
export const TIDE_SEQUENCE: Sequence = {
  id: 'nisc.moss.tide',
  migrations: [
    { description: 'The tide store: facts, runs, work and reflex state, converged from any earlier shape', steps: statementsOf(TIDE_DDL) },
    {
      // A fact's chain: the root it belongs to, and — on a root — how many facts
      // the chain has minted beneath it. Nullable: every existing fact is a
      // root nothing has been counted against yet.
      description: 'A fact carries its chain root, and a root counts what its chain minted (tide maxChainFacts)',
      steps: [
        { kind: 'sql', sql: 'ALTER TABLE tide_fact ADD COLUMN IF NOT EXISTS root text' },
        { kind: 'sql', sql: 'ALTER TABLE tide_fact ADD COLUMN IF NOT EXISTS descendants integer' },
      ],
    },
  ],
};

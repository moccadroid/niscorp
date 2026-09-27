import { sqlSteps, type Sequence } from '@niscorp/strata';
import { TIDE_SEQUENCE } from '@niscorp/moss';

// The Ministry's tables. Who somebody IS in the talk — not yet assigned, a
// department, the speaker, the projector — is read from these rows by the
// identity seam, so a role changes by writing a row, never by signing in again.
//
// THEY GO THROUGH THE LEDGER (strata; AGENTS.md rule 17): LYCEUM_SEQUENCE below,
// applied once and recorded — not run on every boot. Its migration 1 is this
// DDL, verbatim and idempotent, so the talk's live Postgres (which ran it on
// every boot until now) adopts on its next boot with every row kept.
//
// HISTORY: this text is migration 1, and the live database has run it. Change a
// table by APPENDING a migration to LYCEUM_SEQUENCE — editing this makes every
// database that ran it refuse to boot (EDITED). Rewording a `--` comment is fine.
export const DDL = /* sql */ `
  -- The four departments. Each is a role in the charter with a different
  -- clearance; \`remit\` says in plain words what that clearance lets you do.
  -- A department is a MARK (a pattern) and a SIGIL (a shape), not a colour: the
  -- look's colours carry meaning and are not spent on identity.
  CREATE TABLE IF NOT EXISTS departments (
    department_id TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    remit         TEXT NOT NULL,
    mark          TEXT NOT NULL,
    sigil         TEXT NOT NULL,
    position      INT  NOT NULL
  );

  -- One row per person in the room. The row's id IS their principal.
  -- department_id is NULL until they are assigned. The ID card's fields (title,
  -- quirk) are written by the model as it streams; NULL is "not written yet".
  CREATE TABLE IF NOT EXISTS members (
    member_id     TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    title         TEXT,
    quirk         TEXT,
    department_id TEXT REFERENCES departments (department_id),
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_at   TIMESTAMPTZ
  );

  -- THE DECK. Its order is rows; each slide_id names the action that IS the
  -- slide, and tool_id the action the speaker's controller shows alongside it
  -- (the controls that slide needs — assigning the room on the assignment
  -- slide). What a slide shows lives in its actions; which slides, in what
  -- order, lives here.
  CREATE TABLE IF NOT EXISTS slides (
    slide_id TEXT PRIMARY KEY,
    position INT  NOT NULL UNIQUE,
    title    TEXT NOT NULL,
    tool_id  TEXT
  );

  -- THE SPEAKER'S NOTES: a few lines per slide, in order, shown on the
  -- controller beside the slide's tool while that slide is up. Rows, not a
  -- column of text: each line is one thing to say.
  CREATE TABLE IF NOT EXISTS slide_notes (
    slide_id TEXT NOT NULL REFERENCES slides (slide_id) ON DELETE CASCADE,
    position INT  NOT NULL,
    note     TEXT NOT NULL,
    PRIMARY KEY (slide_id, position)
  );

  -- THE TALK'S STATE: one row, the slide on screen now. The controller writes
  -- it; a moss restart lands every screen back on it.
  CREATE TABLE IF NOT EXISTS deck (
    deck_id  TEXT PRIMARY KEY,
    slide_id TEXT NOT NULL REFERENCES slides (slide_id)
  );

  -- Roles granted on top of whatever a person's department makes them, and
  -- the roles of the principals that are not people (the speaker, the stage).
  CREATE TABLE IF NOT EXISTS grants (
    principal  TEXT NOT NULL,
    role       TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (principal, role)
  );

  -- ONE-TIME SIGN-IN LINKS for the principals that are not people (the speaker,
  -- the stage) — minted by the operator on the server (\`pnpm mint <principal>\`),
  -- redeemed once at /login. Only the hash is stored. A testing stand-in for a
  -- mailed link (PLAN.md): the redemption is the same, the transport is not.
  CREATE TABLE IF NOT EXISTS login_links (
    token_hash TEXT PRIMARY KEY,
    principal  TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  );
`;

// Migration 2: A SLIDE'S TOOLS ARE ROWS. A slide put at most one tool on the
// controller (`slides.tool_id`); now it puts as many as it lists, in order —
// the controller's tool region is a list canvas the speaker's deck reconciles
// to these rows. What a database already says is carried over before the
// column goes.
export const SLIDE_TOOLS = /* sql */ `
  CREATE TABLE slide_tools (
    slide_id TEXT NOT NULL REFERENCES slides (slide_id) ON DELETE CASCADE,
    position INT  NOT NULL,
    tool_id  TEXT NOT NULL,
    PRIMARY KEY (slide_id, position)
  );
  INSERT INTO slide_tools (slide_id, position, tool_id) SELECT slide_id, 0, tool_id FROM slides WHERE tool_id IS NOT NULL;
  ALTER TABLE slides DROP COLUMN tool_id;
`;

// Migration 3: THE ASK. Every question somebody put to the records, how it was
// answered — `replayed` (an earlier question's stored query), `generated` (a
// new one, written by the model under the asker's policy) or `refused` — and
// the fingerprint it replays by. `member_id` is the asker's, stamped by the
// engine (vex/behaviors.ts); the projector reads only the counts, never the
// words (a person wrote them, and nothing a person wrote goes up unread).
export const ASKS = /* sql */ `
  CREATE TABLE asks (
    ask_id      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    member_id   TEXT NOT NULL,
    question    TEXT NOT NULL,
    shape       TEXT NOT NULL,
    how         TEXT NOT NULL CHECK (how IN ('replayed', 'generated', 'refused')),
    fingerprint TEXT,
    asked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Migration 4: TIMERS. An automation the speaker asked for and saved — the tide
// reflex itself, as a document, beside when it fires (for the countdown on the
// controller). The reflex is data: this row is what is loaded into tide on every
// boot, and nothing about it is code. `saved_by` is stamped by the engine.
export const TIMERS = /* sql */ `
  CREATE TABLE timers (
    timer_id TEXT PRIMARY KEY,
    reflex   JSONB NOT NULL,
    intent   TEXT NOT NULL,
    due_at   TIMESTAMPTZ,
    saved_by TEXT NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Migration 5: THE ASSISTANT'S CONVERSATIONS. One row per turn — what was
// asked, what was replied, what was proposed — and its OUTCOME once somebody
// acted on a proposal ("saved · fires at 18:56"). Written as the person asking;
// `member_id` is theirs, stamped by the engine, and they read only their own
// (vex/behaviors.ts). The history on the screen, and the context the model gets
// for the next turn, are reads of these rows.
export const ASSISTANT_TURNS = /* sql */ `
  CREATE TABLE assistant_turns (
    turn_id   TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    message   TEXT NOT NULL,
    reply     TEXT NOT NULL,
    proposals JSONB NOT NULL,
    outcome   TEXT,
    asked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

export const LYCEUM_SEQUENCE: Sequence = {
  id: 'lyceum.app',
  migrations: [
    { description: "The Ministry's tables: departments, members, the deck and its notes, grants, sign-in links", steps: sqlSteps(DDL) },
    { description: "A slide's tools are rows (slide_tools), not one column on the slide", steps: sqlSteps(SLIDE_TOOLS) },
    { description: 'The ask: every question put to the records, and how it was answered', steps: sqlSteps(ASKS) },
    { description: 'Timers: automations the speaker saved, each a tide reflex as a document', steps: sqlSteps(TIMERS) },
    { description: "The assistant's conversations: one row per turn, and what came of it", steps: sqlSteps(ASSISTANT_TURNS) },
  ],
};

// EVERY TABLE LYCEUM'S BOOT MUST FIND, in one ledgered run before the server
// starts: its own, and tide's (the talk's timers run on moss's durable tide
// store). Tide's store would create its tables itself on first use — but that
// is after moss's engine has introspected the database, and an engine that
// introspected a different schema than the one a later query was generated
// under treats that query as stale and evicts it. One schema, before anybody
// looks at it.
export const LYCEUM_SEQUENCES: readonly Sequence[] = [LYCEUM_SEQUENCE, TIDE_SEQUENCE];

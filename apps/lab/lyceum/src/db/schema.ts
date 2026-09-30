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

// Migration 6: THE ROOM. One row, the room's own state beside the deck's:
// which LOOK every screen paints with — the poster kit, or plain HTML. The
// speaker's controller writes it; every screen reads it (app/actions/room/).
// A closed set, held by the table: a write of any other word is refused here.
export const ROOM = /* sql */ `
  CREATE TABLE room (
    room_id TEXT PRIMARY KEY,
    look    TEXT NOT NULL DEFAULT 'poster' CHECK (look IN ('poster', 'plain'))
  );
`;

// Migration 7: A QUERY IS A QUERY. Migration 3 named the table after a person
// asking; what it records is a vex query run from words — the request, the
// shape it was answered in, how (replayed, generated, refused), the
// fingerprint. Renamed, rows kept.
export const QUERIES = /* sql */ `
  ALTER TABLE asks RENAME TO queries;
  ALTER TABLE queries RENAME COLUMN ask_id TO query_id;
  ALTER TABLE queries RENAME COLUMN question TO request;
  ALTER TABLE queries RENAME COLUMN asked_at TO run_at;
`;

// Migration 8: QUESTIONS FOR THE SPEAKER — the room's Q&A. One row per
// question, written as the person asking (`member_id` stamped by the engine,
// vex/behaviors.ts). Kept, not yet shown anywhere but the controller.
export const QUESTIONS = /* sql */ `
  CREATE TABLE questions (
    question_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    member_id   TEXT NOT NULL REFERENCES members (member_id),
    text        TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Migration 9: WHAT A TURN RAN. The vex queries the assistant ran in a turn —
// each one's intent, shape and fingerprint — kept with the turn, so the
// conversation can show them and open any of them again.
export const TURNS_OPENED = /* sql */ `
  ALTER TABLE assistant_turns ADD COLUMN opened JSONB NOT NULL DEFAULT '[]'::jsonb;
`;

// Migration 10: WHAT THE TABLES MEAN, where Postgres keeps it. A query writer
// sees names — `members` does not say "the people in the room". Vex reads a
// table's and a column's COMMENT as its description (and leaves it out of the
// schema fingerprint, so rewording one evicts no query).
export const TABLE_MEANINGS = /* sql */ `
  COMMENT ON TABLE members IS 'The people in the room: everybody who has stepped in, one row each. Their ID card is this row.';
  COMMENT ON COLUMN members.name IS 'Their name, as on their ID card.';
  COMMENT ON COLUMN members.title IS 'Their job title on their ID card; NULL while it is being written.';
  COMMENT ON COLUMN members.quirk IS 'The line about them on their ID card; NULL while it is being written.';
  COMMENT ON COLUMN members.department_id IS 'The department they are assigned to; NULL while they are still waiting to be assigned.';
  COMMENT ON COLUMN members.joined_at IS 'When they stepped in: arrival time.';
  COMMENT ON COLUMN members.assigned_at IS 'When they were assigned to their department.';
  COMMENT ON TABLE departments IS 'The departments of the Ministry that the people in the room are assigned to.';
  COMMENT ON COLUMN departments.name IS 'The department''s name.';
  COMMENT ON COLUMN departments.remit IS 'What the department does, in plain words.';
  COMMENT ON COLUMN departments.mark IS 'The pattern that marks the department.';
  COMMENT ON COLUMN departments.sigil IS 'The shape that marks the department.';
  COMMENT ON TABLE queries IS 'Every vex query run in the room: its intent, the shape it answered in, and whether it was replayed, generated or refused.';
  COMMENT ON TABLE questions IS 'Questions the people in the room sent the speaker (Q&A).';
  COMMENT ON TABLE slides IS 'The slides of the talk, in order.';
  COMMENT ON TABLE deck IS 'Which slide is on the projector now.';
`;

// Migration 11: TURNS WRITTEN WRONG, REPAIRED. Before vex bound a list into a
// jsonb column as JSON, the pg driver sent a JS array as a postgres array
// literal: an empty `opened` or `proposals` landed as '{}', a jsonb OBJECT, and
// the conversation could no longer be read. Whatever is not a list is the empty
// list it was meant to be (a non-empty one never parsed, so none was written).
export const TURNS_REPAIRED = /* sql */ `
  UPDATE assistant_turns SET opened = '[]'::jsonb WHERE jsonb_typeof(opened) <> 'array';
  UPDATE assistant_turns SET proposals = '[]'::jsonb WHERE jsonb_typeof(proposals) <> 'array';
`;

// Migration 12: WHAT THE AUTOMATION WRITER ANSWERED. Tide's reflex agent
// answers a request with a draft, a question or a refusal, and its reasoning;
// the turn keeps both, so the person's reply — or their correction of a draft
// they have not saved — goes back to the agent as the conversation, its own
// answer replayed as it gave it. NULL on every turn it did not write in.
export const TURNS_WRITER = /* sql */ `
  ALTER TABLE assistant_turns ADD COLUMN writer_answer JSONB;
  ALTER TABLE assistant_turns ADD COLUMN writer_reasoning TEXT;
`;

// Migration 13: NO DEPARTMENTS. The talk no longer sorts people into
// departments: who has which action is a grant, given and taken on stage. The
// department a member was in, when they were put there, and the departments
// themselves go.
export const NO_DEPARTMENTS = /* sql */ `
  ALTER TABLE members DROP COLUMN department_id;
  ALTER TABLE members DROP COLUMN assigned_at;
  DROP TABLE departments;
  COMMENT ON TABLE members IS 'The people in the audience: everybody who has joined, one row each. Their ID card is this row.';
  COMMENT ON COLUMN members.joined_at IS 'When they joined: arrival time.';
`;

// Migration 14: A RENDERER PER SURFACE. The room had one look for every
// screen, poster or plain. Now each surface — the phones, the projector, the
// speaker's controller — is drawn by a renderer of its own: nova's DOM adapter,
// React or Vue, all three wearing the same stylesheet. One row per surface, set
// from the controller; every screen reads its own (app/actions/look/). Both
// columns are closed sets, held by the table.
export const RENDERERS = /* sql */ `
  CREATE TABLE renderers (
    surface  TEXT PRIMARY KEY CHECK (surface IN ('phones', 'stage', 'controller')),
    position INTEGER NOT NULL UNIQUE,
    renderer TEXT NOT NULL DEFAULT 'dom' CHECK (renderer IN ('dom', 'react', 'vue'))
  );
  INSERT INTO renderers (surface, position) VALUES ('phones', 0), ('stage', 1), ('controller', 2);
  COMMENT ON TABLE renderers IS 'Which renderer draws each kind of screen: the phones, the projector (stage), the speaker''s controller.';
  DROP TABLE room;
`;

export const LYCEUM_SEQUENCE: Sequence = {
  id: 'lyceum.app',
  migrations: [
    { description: "The Ministry's tables: departments, members, the deck and its notes, grants, sign-in links", steps: sqlSteps(DDL) },
    { description: "A slide's tools are rows (slide_tools), not one column on the slide", steps: sqlSteps(SLIDE_TOOLS) },
    { description: 'The ask: every question put to the records, and how it was answered', steps: sqlSteps(ASKS) },
    { description: 'Timers: automations the speaker saved, each a tide reflex as a document', steps: sqlSteps(TIMERS) },
    { description: "The assistant's conversations: one row per turn, and what came of it", steps: sqlSteps(ASSISTANT_TURNS) },
    { description: 'The room: one row, the look every screen paints with', steps: sqlSteps(ROOM) },
    { description: 'A query is a query: asks becomes queries (request, run_at)', steps: sqlSteps(QUERIES) },
    { description: "Questions for the speaker: the room's Q&A, one row per question", steps: sqlSteps(QUESTIONS) },
    { description: 'What a turn ran: the vex queries of each assistant turn', steps: sqlSteps(TURNS_OPENED) },
    { description: 'What the tables mean: comments a query writer reads as descriptions', steps: sqlSteps(TABLE_MEANINGS) },
    { description: 'Turns written wrong, repaired: lists that landed as objects are lists again', steps: sqlSteps(TURNS_REPAIRED) },
    { description: 'What the automation writer answered, and why, on the turn it answered in', steps: sqlSteps(TURNS_WRITER) },
    { description: 'No departments: a member is a member; who has which action is a grant', steps: sqlSteps(NO_DEPARTMENTS) },
    { description: 'A renderer per surface: phones, stage and controller each drawn by DOM, React or Vue; the room row goes', steps: sqlSteps(RENDERERS) },
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

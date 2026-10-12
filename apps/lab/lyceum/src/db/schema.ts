import { sqlSteps, type Sequence } from '@niscorp/strata';
import { TIDE_SEQUENCE } from '@niscorp/tide/postgres';

// This text is migration 1, and the live database has run it. Change a table
// by appending a migration to LYCEUM_SEQUENCE: editing this makes every
// database that ran it refuse to boot. Rewording a `--` comment is fine.
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

export const ROOM = /* sql */ `
  CREATE TABLE room (
    room_id TEXT PRIMARY KEY,
    look    TEXT NOT NULL DEFAULT 'poster' CHECK (look IN ('poster', 'plain'))
  );
`;

export const QUERIES = /* sql */ `
  ALTER TABLE asks RENAME TO queries;
  ALTER TABLE queries RENAME COLUMN ask_id TO query_id;
  ALTER TABLE queries RENAME COLUMN question TO request;
  ALTER TABLE queries RENAME COLUMN asked_at TO run_at;
`;

export const QUESTIONS = /* sql */ `
  CREATE TABLE questions (
    question_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    member_id   TEXT NOT NULL REFERENCES members (member_id),
    text        TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

export const TURNS_OPENED = /* sql */ `
  ALTER TABLE assistant_turns ADD COLUMN opened JSONB NOT NULL DEFAULT '[]'::jsonb;
`;

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

export const TURNS_REPAIRED = /* sql */ `
  UPDATE assistant_turns SET opened = '[]'::jsonb WHERE jsonb_typeof(opened) <> 'array';
  UPDATE assistant_turns SET proposals = '[]'::jsonb WHERE jsonb_typeof(proposals) <> 'array';
`;

export const TURNS_WRITER = /* sql */ `
  ALTER TABLE assistant_turns ADD COLUMN writer_answer JSONB;
  ALTER TABLE assistant_turns ADD COLUMN writer_reasoning TEXT;
`;

export const NO_DEPARTMENTS = /* sql */ `
  ALTER TABLE members DROP COLUMN department_id;
  ALTER TABLE members DROP COLUMN assigned_at;
  DROP TABLE departments;
  COMMENT ON TABLE members IS 'The people in the audience: everybody who has joined, one row each. Their ID card is this row.';
  COMMENT ON COLUMN members.joined_at IS 'When they joined: arrival time.';
`;

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

export const NAMES_AND_VERDICTS = /* sql */ `
  UPDATE members m SET name = m.name || ' ' || substr(m.member_id, 3, 4)
    WHERE EXISTS (SELECT 1 FROM members o WHERE o.name = m.name AND o.member_id < m.member_id);
  ALTER TABLE members DROP COLUMN title;
  ALTER TABLE members DROP COLUMN quirk;
  ALTER TABLE members ADD CONSTRAINT members_name_unique UNIQUE (name);
  COMMENT ON TABLE members IS 'The people in the audience: everybody who has joined, one row each, by the name they chose.';
  COMMENT ON COLUMN members.name IS 'The name they chose when they joined: one of the offered names, or one they typed that was fit to show. Unique.';
  CREATE TABLE refused_names (
    refused_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    text       TEXT NOT NULL,
    score      REAL NOT NULL,
    refused_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  COMMENT ON TABLE refused_names IS 'Names somebody typed when joining that the moderator found not fit to show. Kept for reference; never shown.';
  CREATE TABLE question_verdicts (
    question_id TEXT PRIMARY KEY REFERENCES questions (question_id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    appropriate BOOLEAN NOT NULL,
    score       REAL NOT NULL,
    judged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  COMMENT ON TABLE question_verdicts IS 'The moderator''s verdict on each question for the speaker: whether it is fit to show, and the text it judged (an edited question is judged again). A question with no verdict has not been checked yet.';
`;

export const QUESTION_MEANINGS = /* sql */ `
  COMMENT ON TABLE questions IS 'Questions the people in the audience sent the speaker, through the Acme integration. A question is never edited or deleted once sent.';
  COMMENT ON TABLE question_verdicts IS 'The moderator''s verdict on each question for the speaker: whether it is fit to show, and the text it judged. A question is judged once, as it was sent; one with no verdict has not been checked yet.';
`;

export const PRESSES = /* sql */ `
  CREATE TABLE presses (
    press_id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    member_id  TEXT NOT NULL REFERENCES members (member_id),
    sound      TEXT NOT NULL CHECK (sound IN ('chime')),
    pressed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  COMMENT ON TABLE presses IS 'Each press of the button a few people in the audience were given: who pressed it, and when.';
`;

const SLIDE_PARTS = `
  ALTER TABLE slides ADD COLUMN parts INTEGER NOT NULL DEFAULT 1;
`;

const QUESTIONS_THROUGH = /* sql */ `
  COMMENT ON TABLE questions IS 'Questions the people in the audience sent the speaker, through the Q&A integration. A question is never edited or deleted once sent.';
`;

const DECK_STEP = `
  ALTER TABLE deck ADD COLUMN step INTEGER NOT NULL DEFAULT 0;
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
    { description: 'A name you choose, and what may be shown: no ID card; names unique; refused names kept; a verdict per question, written by the moderator', steps: sqlSteps(NAMES_AND_VERDICTS) },
    { description: 'What the questions tables say: sent through Acme, never edited, judged once', steps: sqlSteps(QUESTION_MEANINGS) },
    { description: 'Presses: one row per press of the button a few people are given', steps: sqlSteps(PRESSES) },
    { description: 'A slide in steps: the deck row says how far the slide on screen has been revealed', steps: sqlSteps(DECK_STEP) },
    { description: 'The questions table says how questions arrive without naming a vendor', steps: sqlSteps(QUESTIONS_THROUGH) },
    { description: 'A slide says how many parts it is shown in', steps: sqlSteps(SLIDE_PARTS) },
  ],
};

// Tide's tables are here because its store would otherwise create them on
// first use, after moss's engine has introspected the database: the engine
// evicts as stale a query generated under a schema other than the one it saw.
export const LYCEUM_SEQUENCES: readonly Sequence[] = [LYCEUM_SEQUENCE, TIDE_SEQUENCE];

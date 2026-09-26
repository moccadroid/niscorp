// The Ministry's tables — idempotent, so the same DDL stands up an empty
// database and leaves a live one alone. Who somebody IS in the talk — not yet
// assigned, a department, the speaker, the projector — is read from these rows
// by the identity seam, so a role changes by writing a row, never by signing in
// again.

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

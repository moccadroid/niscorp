// The room's tables — idempotent, so the same DDL stands up an empty database
// and leaves a live one alone. Who somebody IS in the talk — unsorted, a house, a
// speaker, the projector — is read from these rows by the identity seam, so a
// role changes by writing a row, never by signing in again.

export const DDL = /* sql */ `
  CREATE TABLE IF NOT EXISTS houses (
    house_id  TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    character TEXT NOT NULL,
    colour    TEXT NOT NULL,
    position  INT  NOT NULL
  );

  -- One row per person in the room. The row's id IS their principal.
  -- house_id is NULL until the sorting places them.
  CREATE TABLE IF NOT EXISTS members (
    member_id TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    house_id  TEXT REFERENCES houses (house_id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Capability roles held on top of whatever a person's house makes them, and
  -- the roles of the principals that are not people (the speaker, the stage).
  -- THE DECK. Its order is rows (the streamed agenda composes it, later); each
  -- slide_id names the action that IS the slide. What a slide shows lives in
  -- its action; which slides, and in what order, lives here.
  CREATE TABLE IF NOT EXISTS slides (
    slide_id TEXT PRIMARY KEY,
    position INT  NOT NULL UNIQUE,
    title    TEXT NOT NULL
  );

  -- THE TALK'S STATE: one row, the slide on screen now. The controller's
  -- next/back write it; a moss restart lands every screen back on it.
  CREATE TABLE IF NOT EXISTS deck (
    deck_id  TEXT PRIMARY KEY,
    slide_id TEXT NOT NULL REFERENCES slides (slide_id)
  );

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

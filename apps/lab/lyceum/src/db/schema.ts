// The room's tables. Who somebody IS in the talk — unsorted, a house, a
// speaker, the projector — is read from these rows by the identity seam, so a
// role changes by writing a row, never by signing in again.

export const DDL = /* sql */ `
  CREATE TABLE houses (
    house_id  TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    character TEXT NOT NULL,
    colour    TEXT NOT NULL,
    position  INT  NOT NULL
  );

  -- One row per person in the room. The row's id IS their principal.
  -- house_id is NULL until the sorting places them.
  CREATE TABLE members (
    member_id TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    house_id  TEXT REFERENCES houses (house_id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Capability roles held on top of whatever a person's house makes them, and
  -- the roles of the principals that are not people (the speaker, the stage).
  CREATE TABLE grants (
    principal  TEXT NOT NULL,
    role       TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (principal, role)
  );
`;

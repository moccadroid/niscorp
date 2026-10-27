import { sqlSteps } from '@niscorp/strata';
import type { Sequence } from '@niscorp/strata';

// An address is kept lower-cased, so the one typed at sign-in finds it whatever its case.
const PEOPLE = `
CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
  name text,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE links (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

const ANSWERS = `
CREATE TABLE answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person text NOT NULL,
  question text NOT NULL,
  title text NOT NULL,
  response text,
  plan jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX answers_person_created ON answers (person, created_at DESC);
`;

// A row from before the column reads as written at the start of every grammar, as strata reads a missing stamp.
const ANSWER_GRAMMAR = `
ALTER TABLE answers ADD COLUMN grammar jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE answers ALTER COLUMN grammar DROP DEFAULT;
`;

export const APP_SEQUENCE: Sequence = {
  id: 'mira.app',
  migrations: [
    { description: 'People, and the one-time sign-in links mailed to them', steps: sqlSteps(PEOPLE) },
    { description: 'Every answer a person was given, so their stack outlasts the shell', steps: sqlSteps(ANSWERS) },
    { description: 'An answer keeps the grammars its screen was written at', steps: sqlSteps(ANSWER_GRAMMAR) },
  ],
};

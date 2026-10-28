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

// A message whose answer left the screen as it was, or showed one of the app's screens, is kept too, with no screen of
// its own: the answer or the screen it was asked on is what it opens from the conversation.
const EVERY_MESSAGE = `
ALTER TABLE answers ALTER COLUMN plan DROP NOT NULL;
ALTER TABLE answers ADD COLUMN asked_on uuid;
ALTER TABLE answers ADD COLUMN screen text;
`;

// What each of an answer's cards showed when the person last left it, for the overview's pictures.
const ANSWER_SHOWS = `
ALTER TABLE answers ADD COLUMN shows jsonb;
`;

// The overview draws an answer by its cards as nova drew them, not by what they showed; and an answer closed there
// leaves the stack.
const ANSWER_DRAWN = `
ALTER TABLE answers DROP COLUMN shows;
ALTER TABLE answers ADD COLUMN drawn jsonb;
ALTER TABLE answers ADD COLUMN closed_at timestamptz;
`;

export const APP_SEQUENCE: Sequence = {
  id: 'mira.app',
  migrations: [
    { description: 'People, and the one-time sign-in links mailed to them', steps: sqlSteps(PEOPLE) },
    { description: 'Every answer a person was given, so their stack outlasts the shell', steps: sqlSteps(ANSWERS) },
    { description: 'An answer keeps the grammars its screen was written at', steps: sqlSteps(ANSWER_GRAMMAR) },
    { description: 'Every message answered is kept, the ones that left the screen as it was too', steps: sqlSteps(EVERY_MESSAGE) },
    { description: 'An answer keeps what its cards showed when it was last left', steps: sqlSteps(ANSWER_SHOWS) },
    { description: 'An answer keeps its cards as they were drawn, and when it was closed', steps: sqlSteps(ANSWER_DRAWN) },
  ],
};

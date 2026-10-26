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

export const APP_SEQUENCE: Sequence = {
  id: 'mira.app',
  migrations: [{ description: 'People, and the one-time sign-in links mailed to them', steps: sqlSteps(PEOPLE) }],
};

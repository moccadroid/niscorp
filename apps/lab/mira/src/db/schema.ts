import { sqlSteps, type Sequence } from '@niscorp/strata';

// A migration once run is never edited: a database that ran it refuses to boot. Change a table by appending one.
const GREETINGS = /* sql */ `
  CREATE TABLE IF NOT EXISTS greetings (
    greeting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text        TEXT NOT NULL,
    language    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const HELLO_WORLD = /* sql */ `
  INSERT INTO greetings (text, language, created_at) VALUES
    ('Hello, world', 'English', now() - interval '5 minutes'),
    ('Hallo, Welt', 'German', now() - interval '4 minutes'),
    ('Bonjour le monde', 'French', now() - interval '3 minutes'),
    ('Hola, mundo', 'Spanish', now() - interval '2 minutes'),
    ('Ciao, mondo', 'Italian', now() - interval '1 minute');
`;

export const APP_SEQUENCE: Sequence = {
  id: 'mira.app',
  migrations: [
    { description: 'Greetings: what the app has to show before it has anything of yours', steps: sqlSteps(GREETINGS) },
    { description: 'Five hello-worlds to ask about', steps: sqlSteps(HELLO_WORLD) },
  ],
};

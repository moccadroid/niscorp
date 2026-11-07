import { sqlSteps } from '@niscorp/strata';
import type { Sequence } from '@niscorp/strata';

const GUIDE_PACKAGES = /* sql */ `
  CREATE TABLE packages (
    package_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL UNIQUE,
    purpose    TEXT NOT NULL,
    position   INTEGER NOT NULL
  );
  INSERT INTO packages (name, purpose, position) VALUES
    ('nova', 'The screen: shells, canvases, actions and their layouts.', 1),
    ('moss', 'The app server: a shell for each person, the charter enforced, the socket.', 2),
    ('vex', 'Reads and writes written as JSON, replayed by their fingerprint.', 3),
    ('prism', 'Every transform: data shaped and worded, as JSON.', 4),
    ('charter', 'Who may reach which actions, data and functions.', 5),
    ('strata', 'Versions: tables and documents moved forward by migrations.', 6),
    ('tide', 'Automations: the clock, a write or a signal turned into one effect.', 7),
    ('loom', 'A form compiled from a schema.', 8),
    ('signal', 'Calls to a model.', 9),
    ('cortex', 'Agents: a model call checked, retried and recorded.', 10),
    ('solid', 'A model’s structured answer streamed onto the screen.', 11),
    ('cli', 'The nisc command: dev, build, start and check.', 12);
`;

export const APP_SEQUENCE: Sequence = {
  id: 'nisc-template-app.app',
  migrations: [{ description: 'The tour’s packages: nisc’s packages, each with what it is for', steps: sqlSteps(GUIDE_PACKAGES) }],
};

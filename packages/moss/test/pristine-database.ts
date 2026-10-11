import { PGlite } from '@electric-sql/pglite';
import { inject } from 'vitest';
import { initialisedDirectory } from './initialised-database';

// A DATABASE OF ITS OWN FOR A TEST, WITHOUT INITIALISING ONE EACH TIME.
//
// The run initialises one PGlite before any test file
// (./initialised-database.ts), and each test starts its own from that data
// directory, which skips `initdb`. A test has a database nobody else touches,
// with nothing in it but what Postgres puts there.
//
// Call it once at the top of a test file, and call what it answers wherever
// the file needs a database.
export const pristineDatabases = (): (() => PGlite) => {
  const held: { directory?: Blob } = {};
  return () => {
    held.directory ??= initialisedDirectory(inject('initialisedDatabase'));
    return new PGlite({ loadDataDir: held.directory });
  };
};

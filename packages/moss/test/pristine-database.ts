import { PGlite } from '@electric-sql/pglite';
import { inject } from 'vitest';
import { initialisedDirectory } from './initialised-database';

export const pristineDatabases = (): (() => PGlite) => {
  const held: { directory?: Blob } = {};
  return () => {
    held.directory ??= initialisedDirectory(inject('initialisedDatabase'));
    return new PGlite({ loadDataDir: held.directory });
  };
};

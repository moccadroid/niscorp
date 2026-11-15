import { PGlite } from '@electric-sql/pglite';
import { inject } from 'vitest';
import { initialisedDirectory } from './initialised-database';

export const pristineDatabases = (): (() => PGlite) => {
  const cached: { directory?: Blob } = {};
  return () => {
    cached.directory ??= initialisedDirectory(inject('initialisedDatabase'));
    return new PGlite({ loadDataDir: cached.directory });
  };
};

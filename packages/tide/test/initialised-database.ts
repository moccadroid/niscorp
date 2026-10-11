import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { TestProject } from 'vitest/node';

// ONE INITIALISED DATABASE FOR THE WHOLE RUN, MADE BEFORE ANY TEST IS TIMED.
//
// Starting a PGlite from nothing is mostly `initdb`, and it is the
// processor's work: it takes as much longer as the machine is busy, and inside
// a hook it can pass the hook's limit with nothing wrong. A database that has
// been initialised can be handed on as its data directory, and one started
// from that directory skips `initdb`. So the one start from nothing happens
// here: vitest runs this file once, before any test file, with no limit on
// how long it takes. It writes the directory to a file and tells the tests
// where (`inject('initialisedDatabase')`).

declare module 'vitest' {
  export interface ProvidedContext {
    initialisedDatabase: string;
  }
}

const made: { folder?: string } = {};

export const setup = async (project: TestProject): Promise<void> => {
  const database = new PGlite();
  const directory = await database.dumpDataDir('none');
  await database.close();
  const folder = mkdtempSync(join(tmpdir(), 'tide-test-'));
  const file = join(folder, 'pgdata.tar');
  writeFileSync(file, Buffer.from(await directory.arrayBuffer()));
  made.folder = folder;
  project.provide('initialisedDatabase', file);
};

export const teardown = (): void => {
  if (made.folder !== undefined) rmSync(made.folder, { recursive: true, force: true });
};

// The directory `setup` wrote, as what a PGlite starts from.
export const initialisedDirectory = (file: string): Blob => new Blob([readFileSync(file)]);

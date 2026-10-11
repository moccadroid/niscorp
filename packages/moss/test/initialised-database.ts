import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { TestProject } from 'vitest/node';

// ONE INITIALISED DATABASE FOR THE WHOLE RUN, MADE BEFORE ANY TEST IS TIMED.
//
// Starting a PGlite from nothing is mostly `initdb`: 660 ms measured on an
// idle machine. It is the processor's work, so it takes as much longer as the
// machine is busy: with every package's tests running at once (`pnpm verify`)
// one such start in a `beforeAll` passed vitest's 10 s for a hook in tide's
// tests, which failed with nothing wrong in them. The ten files here that run
// on a database each made the same start in the same kind of hook.
//
// A database that has been initialised can be handed on as its data
// directory, and one started from that directory skips `initdb` (140 ms,
// measured the same way). So the one start from nothing happens here: vitest
// runs this file once, before any test file, with no limit on how long it
// takes. It writes the directory to a file and tells the tests where
// (`inject('initialisedDatabase')`); ./pristine-database.ts starts each
// test's database from it.

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
  const folder = mkdtempSync(join(tmpdir(), 'moss-test-'));
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

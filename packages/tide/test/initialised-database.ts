import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { TestProject } from 'vitest/node';

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

export const initialisedDirectory = (file: string): Blob => new Blob([readFileSync(file)]);

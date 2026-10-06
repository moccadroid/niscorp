import { defineApp } from '@niscorp/moss';
import type { NiscMossProject } from '../../../src';

// An app that hands `nisc migrate` what it needs, on a stand-in for a database:
// one that has no tables, answers every question with no rows, and says how
// each transaction ended and that it was let go — so a test can read what the
// command did to it.
//
// NISC_FIXTURE_FAULT=misfit gives the manifest one entry, reading a table the
// database does not have.
const fault = process.env['NISC_FIXTURE_FAULT'] ?? '';

const answer = async (): Promise<{ rows: Record<string, unknown>[] }> => ({ rows: [] });
const say = (line: string): void => console.log(`fixture: ${line}`);

export const project: NiscMossProject = {
  boot: async () => {
    throw new Error('this fixture is only migrated');
  },
  draw: () => {
    throw new Error('this fixture draws nothing');
  },
  app: defineApp({
    charter: { public: [] },
    actions: {},
    entries: fault === 'misfit' ? [{ fingerprint: 'notes/all', dsl: { from: ['notes'], fields: ['notes.id'] } }] : [],
  }),
  runtime: async () => {
    const pool = {
      query: answer,
      transaction: async <T>(fn: (tx: { query: typeof answer }) => Promise<T>): Promise<T> => {
        try {
          const result = await fn({ query: answer });
          say('committed');
          return result;
        } catch (error) {
          say('rolled back');
          throw error;
        }
      },
    };
    return {
      pool,
      db: pool,
      session: 'sessions',
      tables: [{ id: 'fixture.app', migrations: [{ description: 'things', steps: [{ kind: 'sql', sql: 'CREATE TABLE things (id serial PRIMARY KEY)' }] }] }],
      close: () => say('let go'),
    };
  },
};

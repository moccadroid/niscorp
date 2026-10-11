import { describe, it, expect, vi, afterEach } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { DatabaseSchema } from '@niscorp/vex';
import { createDataWith } from '../src/data/data';
import { featureTablesOf } from '../src/data/migrate';
import { createGrammarUpgrader } from '../src/data/engine';
import type { Feature } from '../src/feature';
import type { NiscApp } from '../src/manifest';
import { PROTOCOL } from '../src/protocol';
import { assembleServer } from '../src/server/assemble';
import { NOTES_SCHEMA, engineDouble, tableNamed } from './data-double';

// THE CORE READS AND WRITES NO ROW OF A FEATURE'S TABLES. The integrations'
// three are in every deployment's database (`nisc.moss` makes two of them,
// whether or not the app names the feature). Here a server stands over a
// database that has the three tables, with everything that could reach a row
// recorded: each table a read names, each statement a write sends, each
// statement the pool is sent, and each store whose documents are upgraded.
//
// No database: the engine reads through a double (./data-double.ts), and the
// server is the one `createServer` assembles once a database is up.

const THEIRS = ['integrations', 'integration_actions', 'integration_frame_grants'];
const schema: DatabaseSchema = { entities: [...NOTES_SCHEMA.entities, ...THEIRS.map(tableNamed)] };
const whoseToken = (token: string): string | null => (token.startsWith('t_') ? token.slice(2) : null);

const standing = async (features: readonly Feature[]) => {
  const double = await engineDouble(undefined, schema);
  const upgraded: string[] = [];
  const sentToThePool: string[] = [];
  const app: NiscApp = {
    charter: { public: ['home'], member: { actions: ['home'], data: ['notes.read', 'notes.write.insert'] } },
    actions: { home: { id: 'home' } },
    shell: { canvases: [{ id: 'main', initial: 'home' }] },
    identity: { resolve: async () => ({ roles: ['member'], scope: {} }) },
    features: [...features],
  };
  const data = createDataWith(
    {
      engine: double.engine,
      adapter: double.adapter,
      grants: scopeGrants(schema.entities.map((entity) => entity.name)),
      grammars: await createGrammarUpgrader({}),
      upgradeStore: async (store) => void upgraded.push(store.table),
    },
    { db: double.db, charter: app.charter, featureTables: featureTablesOf(app) },
  );
  const server = await assembleServer({
    app,
    runtime: { pool: { query: async (text) => (sentToThePool.push(text), { rows: [] }) }, db: double.db, session: 'dev-open', operatorKey: 'the-operators-key' },
    session: whoseToken,
    revokeSessions: undefined,
    data,
  });
  // Every table anything reached, however it reached it.
  const reached = (): string[] => [...double.tablesRead, ...double.written.map((write) => write.sql), ...sentToThePool, ...upgraded];
  return { server, reached, upgraded };
};

const asMara = { authorization: 'Bearer t_i_mara', 'content-type': 'application/json' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the core, and the tables that are a feature’s', () => {
  it('a server that names no integrations feature reads and writes no row of the integrations’ tables', async () => {
    // The pointer's table is not in this database: what the poll says of that is not this test's.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { server, reached, upgraded } = await standing([]);
    try {
      // Everything a core does: who is calling and what they hold, a read, a
      // write, the list of what may be replayed, a shell, a terminal, a change
      // to what the app consists of, and a principal who is forgotten.
      expect((await server.request('/catalog', { headers: asMara })).status).toBe(200);
      expect((await server.request('/api/vex', { method: 'POST', headers: asMara, body: JSON.stringify({ fingerprint: 'notes/all', context: {} }) })).status).toBe(200);
      expect((await server.request('/api/vex', { method: 'POST', headers: asMara, body: JSON.stringify({ fingerprint: 'notes/add', context: { body: 'a note' } }) })).status).toBe(200);
      expect((await server.request('/api/vex', { headers: asMara })).status).toBe(200);
      await server.shells?.session('t_i_mara', 'i_mara');
      await server.socket(`/socket?protocol=${PROTOCOL}`, { send: () => undefined, close: () => undefined, onMessage: () => undefined, onClose: () => undefined });
      server.refresh();
      server.replaceActions('extras', { extra: { id: 'extra' } });
      server.invalidateIdentity('i_mara');
      server.nudge('i_mara', 'news');
      await server.catalogOf('i_mara');

      // The rows it did reach are the app's.
      expect(reached().join('\n')).toContain('notes');
      expect(reached().filter((what) => THEIRS.some((table) => what.includes(table)))).toEqual([]);
      expect(upgraded).toEqual([]);
      // And nothing of the feature answers: its routes were never mounted.
      expect((await server.request('/operator/integrations', { headers: { 'x-operator-key': 'the-operators-key' } })).status).toBe(404);
      expect((await server.request('/api/integrations/contract', { headers: asMara })).status).toBe(404);
    } finally {
      server.close();
    }
  });

  // What the case above is worth: a row of one of those tables, reached by
  // somebody, is in the record. Here a feature that names two of them as its
  // own reads one through its own entries and has the other's documents
  // brought current, as the integrations feature does when it starts.
  it('…and the record would have shown it: a feature whose own tables those are is seen reaching them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const registry: Feature = {
      name: 'registry',
      tables: { names: ['integrations', 'integration_actions'] },
      start: async (seams) => {
        const replay = await seams.ownEntries([{ fingerprint: 'registry/all', dsl: { from: ['integrations'], fields: ['integrations.id'] } }]);
        await replay('registry/all', {});
        await seams.upgradeStore({ table: 'integration_actions', column: 'definition', stamp: 'grammar', kind: 'nisc.nova/action', key: ['id'] });
      },
    };
    const { server, reached, upgraded } = await standing([registry]);
    try {
      expect(reached()).toContain('integrations');
      expect(upgraded).toEqual(['integration_actions']);
    } finally {
      server.close();
    }
  });
});

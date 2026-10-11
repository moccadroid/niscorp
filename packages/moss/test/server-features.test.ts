import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { scopeGrants } from '@niscorp/vex';
import type { SeedEntry } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import { dataOver } from '../src/data/data';
import { featureTablesOf } from '../src/data/feature-tables';
import { createGrammarUpgrader } from '../src/data/grammar';
import type { Feature, FeatureSeams } from '../src/feature';
import { memoKey } from '../src/identity';
import { createRunningManifest } from '../src/manifest';
import { emptyRegister, startFeatures } from '../src/server/features';
import type { SeamParts } from '../src/server/features';
import type { Env } from '../src/server/moss-server';
import { engineDouble } from './data-double';

// THE FEATURES AS THE SERVER STARTS THEM (../src/server/features.ts), with no
// server and no database: the running manifest is the real one, the data
// module stands over an engine with nothing behind it (./data-double.ts), and
// who somebody is is a function written here.
//
// `Feature` and `FeatureSeams` are public, so anybody can write a feature.
// What one is handed decides what it can do, whatever it was written to do.

const charter: Charter = { public: ['home'] };

// The database the engine reads has two tables, `notes` and `tags`, and one
// row to answer any read with (./data-double.ts). `features` is what the app
// named: the data module is told which tables each one named as its own, as
// the server tells it.
const world = async (features: readonly Feature[] = []): Promise<{ parts: SeamParts; server: Hono<Env>; operator: Hono<Env>; start: () => Promise<void> }> => {
  const double = await engineDouble();
  const grants = scopeGrants(['notes', 'tags']);
  const data = dataOver(
    { engine: double.engine, adapter: double.adapter, grants, grammars: await createGrammarUpgrader({}), upgradeStore: async () => undefined },
    { db: double.db, charter, featureTables: featureTablesOf({ features }) },
  );
  const running = createRunningManifest({ shipped: { charter, actions: { home: { id: 'home' } } }, grants });
  const server = new Hono<Env>();
  const operator = new Hono<Env>();
  const resolved = { roles: ['public'], scope: {}, installed: undefined, key: memoKey(['public'], undefined) };
  const parts: SeamParts = {
    app: { charter },
    runtime: {},
    server,
    operator,
    registered: emptyRegister(),
    identity: { resolve: async () => resolved, scopeValuesFor: async () => ({}) },
    running,
    data,
  };
  return { server, operator, parts, start: () => startFeatures(features, parts) };
};

// A feature that keeps what it was started with, and does nothing else.
const keeping = (name: string): { feature: Feature; seams: () => FeatureSeams } => {
  const kept: FeatureSeams[] = [];
  return {
    feature: {
      name,
      start: (seams) => {
        kept.push(seams);
      },
    },
    seams: () => {
      const [seams] = kept;
      if (seams === undefined) throw new Error(`the feature "${name}" was not started`);
      return seams;
    },
  };
};

describe('the features, as the server starts them', () => {
  it('each is started with seams of its own: what one is handed is not what the next is', async () => {
    const first = keeping('first');
    const second = keeping('second');
    const { start } = await world([first.feature, second.feature]);
    await start();
    expect(first.seams()).not.toBe(second.seams());
  });

  // The seed assertions are signed with was a member of the seams, so every
  // feature was handed the private half of that key. It is the integrations
  // feature's own setting now (`createIntegrations({ signingSeed })`).
  it('none is handed a signing seed', async () => {
    const probe = keeping('probe');
    const { start } = await world([probe.feature]);
    await start();
    expect(Object.keys(probe.seams())).not.toContain('signingSeed');
  });
});

const TAGS: SeedEntry = { fingerprint: 'tagging/all', dsl: { from: ['tags'], fields: ['tags.id'], limit: 10 } };
const NOTES: SeedEntry = { fingerprint: 'probe/notes', dsl: { from: ['notes'], fields: ['notes.id', 'notes.body'], limit: 10 } };

// WHAT A REVIEWER RAN: a feature of its own, booted beside the app, that
// handed `ownEntries` a read of a table with the table's name beside it. The
// seam admitted whatever tables the caller named, so it read every session.
describe("the features — a feature's own entries", () => {
  it('reach the tables that feature named as its own', async () => {
    const tagging = keeping('tagging');
    const { start } = await world([{ ...tagging.feature, tables: { names: ['tags'] } }]);
    await start();
    const replay = await tagging.seams().ownEntries([TAGS]);
    expect(await replay('tagging/all', {})).toEqual([{ id: 1, body: 'first' }]);
  });

  it('a feature that names no table reads none: an entry over a table of the app is refused when it is handed over', async () => {
    const probe = keeping('probe');
    const { start } = await world([probe.feature]);
    await start();
    await expect(probe.seams().ownEntries([NOTES])).rejects.toThrow(
      /^moss: the feature "probe" handed over an entry that reads or writes a table that is not its own: "probe\/notes"\. Its own entries run outside the app's policy, so they reach no table, because it names none as its own\./,
    );
  });

  it("one feature's seams do not reach another feature's table", async () => {
    const tagging = keeping('tagging');
    const probe = keeping('probe');
    const { start } = await world([{ ...tagging.feature, tables: { names: ['tags'] } }, { ...probe.feature, tables: { names: ['notes'] } }]);
    await start();
    await expect(probe.seams().ownEntries([TAGS])).rejects.toThrow(/the feature "probe" handed over an entry that reads or writes a table that is not its own: "tagging\/all"/);
    await expect(tagging.seams().ownEntries([NOTES])).rejects.toThrow(/the feature "tagging" handed over an entry/);
  });
});

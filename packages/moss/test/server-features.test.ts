import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { scopeGrants } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import { dataOver } from '../src/data/data';
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

const world = async (): Promise<{ parts: SeamParts; server: Hono<Env>; operator: Hono<Env> }> => {
  const double = await engineDouble();
  const grants = scopeGrants(['notes', 'tags']);
  const data = dataOver({ engine: double.engine, adapter: double.adapter, grants, grammars: await createGrammarUpgrader({}) }, { db: double.db, charter });
  const running = createRunningManifest({ shipped: { charter, actions: { home: { id: 'home' } } }, grants });
  const server = new Hono<Env>();
  const operator = new Hono<Env>();
  const resolved = { roles: ['public'], scope: {}, installed: undefined, key: memoKey(['public'], undefined) };
  return {
    server,
    operator,
    parts: {
      app: { charter },
      runtime: {},
      server,
      operator,
      registered: emptyRegister(),
      identity: { resolve: async () => resolved, scopeValuesFor: async () => ({}) },
      running,
      data,
    },
  };
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
    const { parts } = await world();
    const first = keeping('first');
    const second = keeping('second');
    await startFeatures([first.feature, second.feature], parts);
    expect(first.seams()).not.toBe(second.seams());
  });
});

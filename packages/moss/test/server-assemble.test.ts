import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { scopeGrants } from '@niscorp/vex';
import { dataOver } from '../src/data/data';
import { featureTablesOf } from '../src/data/feature-tables';
import { createGrammarUpgrader } from '../src/data/grammar';
import type { Feature, FeatureEnv } from '../src/feature';
import type { NiscApp } from '../src/manifest';
import type { NiscRuntime } from '../src/runtime';
import { assembleServer } from '../src/server/assemble';
import { engineDouble } from './data-double';

// THE SERVER, ASSEMBLED OVER A DATA MODULE WITH NO DATABASE BEHIND IT
// (../src/server/assemble.ts): everything `createServer` does once the
// database is up.
//
// WHAT A BOOT STARTED, A BOOT THAT FAILS STOPS. A server that is returned has
// one `close` for every timer it owns. One that was never returned had
// nothing: a reviewer's feature threw in `start`, the boot was refused, and
// two intervals went on running, with nobody holding anything to stop them
// by. A dev server that re-boots on every edit keeps each of those until the
// process ends.

// An app with what starts a timer before a feature is started: a shell, whose
// host sweeps idle shells, and an identity seam, whose cache sweeps idle
// records.
const appWith = (more: Partial<NiscApp>): NiscApp => ({
  charter: { public: ['home'] },
  actions: { home: { id: 'home' } },
  shell: { canvases: [{ id: 'main', initial: 'home' }] },
  identity: { resolve: async () => ({ roles: ['public'], scope: {} }) },
  ...more,
});

const assemble = async (app: NiscApp, more: Partial<NiscRuntime> = {}) => {
  const double = await engineDouble();
  const data = dataOver(
    { engine: double.engine, adapter: double.adapter, grants: scopeGrants(['notes', 'tags']), grammars: await createGrammarUpgrader({}), upgradeStore: async () => undefined },
    { db: double.db, charter: app.charter, featureTables: featureTablesOf(app) },
  );
  return assembleServer({ app, runtime: { pool: { query: async () => ({ rows: [] }) }, db: double.db, session: 'dev-open', ...more }, session: () => null, revokeSessions: undefined, data });
};

// Every interval made while `run` ran, and which of them were cleared.
const intervalsDuring = async (run: () => Promise<unknown>): Promise<{ made: unknown[]; left: unknown[]; outcome: unknown }> => {
  const set = vi.spyOn(globalThis, 'setInterval');
  const clear = vi.spyOn(globalThis, 'clearInterval');
  const outcome = await run().catch((error: unknown) => error);
  const made = set.mock.results.map((result) => result.value);
  const cleared = new Set(clear.mock.calls.map(([handle]) => handle));
  return { made, left: made.filter((handle) => !cleared.has(handle)), outcome };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the server, assembled — a boot that fails stops what it started', () => {
  it('a feature that throws when it is started leaves no interval running', async () => {
    const failing = { name: 'failing', start: () => Promise.reject(new Error('the feature could not start')) };
    const { made, left, outcome } = await intervalsDuring(() => assemble(appWith({ features: [failing] })));
    expect(outcome).toMatchObject({ message: 'the feature could not start' });
    // The shell host's sweep and the identity cache's: both were running.
    expect(made).toHaveLength(2);
    expect(left).toEqual([]);
  });

  it('a page the router refuses leaves none either: the app’s own host had been made before it', async () => {
    const twice = { path: '/docs/:id/versions/:id', canvases: [{ id: 'main', initial: 'home' }] };
    const { made, left, outcome } = await intervalsDuring(() => assemble(appWith({ pages: { twice } })));
    expect(outcome).toMatchObject({ message: expect.stringMatching(/names the parameter ":id" twice/) });
    expect(made.length).toBeGreaterThan(0);
    expect(left).toEqual([]);
  });

  it('a boot that succeeds keeps what it started until it is closed, and then keeps nothing', async () => {
    // The pointer is polled once the server stands, and the database here has
    // no such row to read: what the poll says of that is not this test's.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { made, left, outcome } = await intervalsDuring(async () => {
      const server = await assemble(appWith({}));
      return server;
    });
    // The two sweeps, the socket's revalidation and the generation poll.
    expect(made).toHaveLength(4);
    expect(left).toHaveLength(4);
    const clear = vi.spyOn(globalThis, 'clearInterval');
    expect(outcome).toMatchObject({ close: expect.any(Function) });
    if (outcome !== null && typeof outcome === 'object' && 'close' in outcome && typeof outcome.close === 'function') outcome.close();
    expect(new Set(clear.mock.calls.map(([handle]) => handle))).toEqual(new Set(made));
  });
});

// TWO THINGS THE ASSEMBLY DOES IN AN ORDER, OR AT A MOMENT, THAT NOTHING ELSE
// SAYS. Both were found by taking the line out and running every test: none
// failed.
describe('the server, assembled — what holds only because of where a line stands', () => {
  // The pointer is read once the server stands, and the database here has no
  // such row: what the poll says of that is not these tests'.
  const quiet = (): void => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  };

  // A PREFIX'S ROUTES ARE TAKEN WHEN IT IS MOUNTED. A feature adds its
  // operator routes while it starts, so the prefix is mounted after every
  // feature has started. Mounted before, the prefix was empty when it was
  // taken: the operator's own key was answered 404, the same answer a stranger
  // gets, on every route a feature had.
  it('a route a feature adds to the operator prefix answers the operator’s key, and nobody else', async () => {
    quiet();
    const listing: Feature = {
      name: 'listing',
      start: (seams) => {
        const routes = new Hono<FeatureEnv>();
        routes.get('/things', (c) => c.json({ things: ['one'] }));
        seams.mountOperatorRoutes(routes);
      },
    };
    const server = await assemble(appWith({ features: [listing] }), { operatorKey: 'the-operators-key' });
    try {
      const asked = await server.request('/operator/things', { headers: { 'x-operator-key': 'the-operators-key' } });
      expect(asked.status).toBe(200);
      expect(await asked.json()).toEqual({ things: ['one'] });
      expect((await server.request('/operator/things', { headers: { 'x-operator-key': 'another-key' } })).status).toBe(404);
      expect((await server.request('/operator/things')).status).toBe(404);
    } finally {
      server.close();
    }
  });

  // WHO SOMEBODY IS WAS DERIVED FROM WHAT THE APP CONSISTED OF: a role, an
  // install, an approval. When that changes, the records go with the policies
  // compiled from them. Kept, a promoted instructor held their old rung until
  // the record went stale on its own clock, a minute by default.
  it('a change to what the app consists of drops every identity record: who somebody is, is asked again', async () => {
    quiet();
    const now = { roles: ['public'] };
    const app = appWith({
      charter: { public: ['home'], staff: ['home'] },
      identity: { resolve: async () => ({ roles: now.roles, scope: {} }) },
    });
    const server = await assemble(app);
    try {
      expect((await server.identity('i_mara')).roles).toEqual(['public']);
      // The record is held: what the app would answer now is not asked.
      now.roles = ['staff'];
      expect((await server.identity('i_mara')).roles).toEqual(['public']);
      server.refresh();
      expect((await server.identity('i_mara')).roles).toEqual(['staff']);
      // And a set of actions handed over is such a change too.
      now.roles = ['public'];
      server.replaceActions('extras', { extra: { id: 'extra' } });
      expect((await server.identity('i_mara')).roles).toEqual(['public']);
    } finally {
      server.close();
    }
  });
});

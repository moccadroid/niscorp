import { describe, it, expect, vi, afterEach } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import { dataOver } from '../src/data/data';
import { featureTablesOf } from '../src/data/feature-tables';
import { createGrammarUpgrader } from '../src/data/grammar';
import type { NiscApp } from '../src/manifest';
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

const assemble = async (app: NiscApp) => {
  const double = await engineDouble();
  const data = dataOver(
    { engine: double.engine, adapter: double.adapter, grants: scopeGrants(['notes', 'tags']), grammars: await createGrammarUpgrader({}), upgradeStore: async () => undefined },
    { db: double.db, charter: app.charter, featureTables: featureTablesOf(app) },
  );
  return assembleServer({ app, runtime: { pool: { query: async () => ({ rows: [] }) }, db: double.db, session: 'dev-open' }, session: () => null, revokeSessions: undefined, data });
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

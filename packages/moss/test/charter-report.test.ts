import { describe, it, expect, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { defineApp } from '../src/manifest';
import { createServer } from '../src/server';
import { pristineDatabases } from './pristine-database';

// A database of its own for each test that wants one, started from one that
// was initialised once for this file (./pristine-database.ts says why).
const freshDatabase = pristineDatabases();

// THE REPORT BOOT VERIFIED, HANDED BACK. `createServer` refuses on the report's
// errors and reads nothing else of it, so the warnings (an action no role
// grants, an allow that matches nothing) and each role's closure issues were
// computed on every boot and every change and then dropped. A host that
// wanted them had to run `verifyCharter` again, over a data universe it built
// by hand. `charterReport()` is the one the server itself verified.
//
// And it answers for WHAT IS IN FORCE. What the app consists of changes through
// one door, `replaceActions`, which verifies before it switches: a set the app
// could not be served with is refused, and the report, the actions and what
// each principal holds stay as they were. `verifyActions` is that door's dry
// run. The charter is not something that changes after the hand-over at all;
// the last case is what a boot says to one that does not hold.

const home: ActionDefinition = {
  id: 'home',
  triggers: [{ event: 'ui:click', ref: 'open', do: [{ push: { action: 'admin.panel' } }] }],
};
const panel: ActionDefinition = { id: 'admin.panel' };
const stray: ActionDefinition = { id: 'stray' };
const daily: ActionDefinition = { id: 'reports.daily' };

// `reports.*` matches nothing (a dead allow); `stray` is granted by nobody
// (an orphan); `public` holds `home` but not the action it pushes.
const charter = { public: ['home', 'reports.*'], admin: ['home', 'admin.panel'] };

const manifest = () =>
  defineApp({
    charter,
    assignments: { usr_admin: ['admin'], usr_both: ['public', 'admin'] },
    actions: { home, 'admin.panel': panel, stray },
  });

// 'dev-open' and PGlite each announce themselves at boot; neither line is this test.
const quietly = async <T>(run: () => Promise<T>): Promise<T> => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    return await run();
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
};

const boot = async (app: ReturnType<typeof manifest>) => {
  const pool = createPglitePool(freshDatabase());
  return quietly(() => createServer(app, { pool, db: pool, session: 'dev-open' }));
};

// An id that is a namespace of another is something the charter engine
// refuses: a set that ships `home.sub` beside the app's `home` is a set the
// app could not be served with.
const unservable: Record<string, ActionDefinition> = { 'home.sub': { id: 'home.sub' } };

describe('charterReport — the report the server booted on', () => {
  it('carries the warnings and the closure issues boot does not refuse on', async () => {
    const server = await boot(manifest());
    const report = server.charterReport();

    expect(report.errors).toEqual([]);
    expect(report.warnings.map((warning) => warning.rule).sort()).toEqual(['dead-allow', 'orphan']);
    const issuesOf = (role: string): string[] => report.perRole.find((entry) => entry.role === role)?.issues ?? [];
    expect(issuesOf('public').join(' ')).toContain('admin.panel');
    expect(issuesOf('admin')).toEqual([]);
    server.close();
  });

  it('is replaced by a change that passes, with the actions in force and what each principal holds', async () => {
    const server = await boot(manifest());
    const booted = server.charterReport();
    expect(booted.warnings.some((warning) => warning.rule === 'dead-allow')).toBe(true);
    expect((await server.catalogOf(null)).ids).toEqual(['home']);

    // The set gives `reports.*` something to match: the allow is no longer dead.
    server.replaceActions('reports', { [daily.id]: daily });

    expect(server.charterReport()).not.toBe(booted);
    expect(server.charterReport().warnings.map((warning) => warning.rule)).toEqual(['orphan']);
    expect(Object.keys(server.actions())).toEqual(['home', 'admin.panel', 'stray', 'reports.daily']);
    expect((await server.catalogOf(null)).ids).toEqual(['home', 'reports.daily']);
    expect((await server.catalogOf('usr_admin')).ids).toEqual(['admin.panel', 'home']);
    // Somebody who holds two roles holds what either grants.
    expect((await server.catalogOf('usr_both')).ids).toEqual(['admin.panel', 'home', 'reports.daily']);
    server.close();
  });

  it('a set the app could not be served with is refused, and what is in force is unchanged', async () => {
    const server = await boot(manifest());
    server.replaceActions('reports', { [daily.id]: daily });
    const served = server.charterReport();
    const inForce = server.actions();
    const held = await server.catalogOf(null);

    // The door refuses with the same finding.
    expect(() => server.replaceActions('reports', unservable)).toThrow(/^Refresh refused — charter incoherent over the new artifacts:\n {2}leaves-only: id "home" is a namespace of "home.sub"/);

    // Neither changed anything: the report is the one the server is still
    // serving on, and the set it tried to replace is still in force.
    expect(server.charterReport()).toBe(served);
    expect(server.actions()).toBe(inForce);
    expect(Object.keys(server.actions())).toEqual(['home', 'admin.panel', 'stray', 'reports.daily']);
    expect(await server.catalogOf(null)).toBe(held);
    server.close();
  });
});

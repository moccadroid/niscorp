import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { ActionDefinition } from '@niscorp/nova';
import { defineApp } from '../src/manifest';
import { createServer } from '../src/server';

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
    assignments: { usr_admin: ['admin'] },
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
  const pool = createPglitePool(new PGlite());
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
    expect(server.catalogForRoles(['public', 'admin']).ids).toEqual(['admin.panel', 'home', 'reports.daily']);
    server.close();
  });

  it('a set the app could not be served with is refused, and what is in force is unchanged', async () => {
    const server = await boot(manifest());
    server.replaceActions('reports', { [daily.id]: daily });
    const served = server.charterReport();
    const inForce = server.actions();
    const held = await server.catalogOf(null);

    // The dry run says why, and that another set would be taken.
    const dry = server.verifyActions('reports', unservable);
    expect(dry.errors.map((error) => error.check)).toEqual(['charter']);
    expect(dry.errors[0]?.detail).toMatch(/^leaves-only: id "home" is a namespace of "home.sub"/);
    expect(server.verifyActions('reports', {}).errors).toEqual([]);

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

  it('a charter that does not hold is refused by the boot it is handed to', async () => {
    // A deny that matches nothing is an error. A manifest is not edited after
    // it is handed over, so the only moment a charter can be refused is this one.
    const incoherent = defineApp({ ...manifest(), charter: { ...charter, admin: { allow: ['home', 'admin.panel'], deny: ['hmoe'] } } });
    await expect(boot(incoherent)).rejects.toThrow(/^Charter is incoherent — refusing to serve:\n {2}dead-deny: role "admin" denies "hmoe"/);
  });

  it('once createServer has returned, the manifest it was handed cannot be edited', async () => {
    const app = manifest();
    const server = await boot(app);
    const served = server.charterReport();
    const inForce = server.actions();

    // What a `refresh` used to be asked to take: the charter and the actions,
    // replaced or edited in place. Each throws where it is written.
    expect(() => {
      app.charter = { ...charter, admin: { allow: ['home', 'admin.panel'], deny: ['hmoe'] } };
    }).toThrow(TypeError);
    expect(() => {
      app.charter['admin'] = ['home'];
    }).toThrow(TypeError);
    expect(() => {
      app.actions = { home, 'admin.panel': panel };
    }).toThrow(TypeError);
    expect(() => {
      app.actions[daily.id] = daily;
    }).toThrow(TypeError);
    expect(() => {
      delete app.actions['stray'];
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(home, { title: 'Home' });
    }).toThrow(TypeError);

    // So a `refresh` finds what was verified, and nothing was served in between.
    server.refresh();
    expect(server.charterReport().warnings).toEqual(served.warnings);
    expect(server.actions()).toEqual(inForce);
    expect(Object.keys(app.actions)).toEqual(['home', 'admin.panel', 'stray']);

    // A set that was taken is the manifest's too. The app changes one by
    // handing over another.
    const set: Record<string, ActionDefinition> = { [daily.id]: daily };
    server.replaceActions('reports', set);
    expect(() => {
      delete set[daily.id];
    }).toThrow(TypeError);
    server.replaceActions('reports', {});
    expect(Object.keys(server.actions())).toEqual(['home', 'admin.panel', 'stray']);
    server.close();
  });
});

import { describe, it, expect, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { defineApp } from '../src/manifest';
import { createServer } from '../src/server';
import { pristineDatabases } from './pristine-database';

const freshDatabase = pristineDatabases();

const home: ActionDefinition = {
  id: 'home',
  triggers: [{ event: 'ui:click', ref: 'open', do: [{ push: { action: 'admin.panel' } }] }],
};
const panel: ActionDefinition = { id: 'admin.panel' };
const stray: ActionDefinition = { id: 'stray' };
const daily: ActionDefinition = { id: 'reports.daily' };

const charter = { public: ['home', 'reports.*'], admin: ['home', 'admin.panel'] };

const manifest = () =>
  defineApp({
    charter,
    assignments: { usr_admin: ['admin'], usr_both: ['public', 'admin'] },
    actions: { home, 'admin.panel': panel, stray },
  });

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

    server.replaceActions('reports', { [daily.id]: daily });

    expect(server.charterReport()).not.toBe(booted);
    expect(server.charterReport().warnings.map((warning) => warning.rule)).toEqual(['orphan']);
    expect(Object.keys(server.actions())).toEqual(['home', 'admin.panel', 'stray', 'reports.daily']);
    expect((await server.catalogOf(null)).ids).toEqual(['home', 'reports.daily']);
    expect((await server.catalogOf('usr_admin')).ids).toEqual(['admin.panel', 'home']);
    expect((await server.catalogOf('usr_both')).ids).toEqual(['admin.panel', 'home', 'reports.daily']);
    server.close();
  });

  it('a set the app could not be served with is refused, and what is in force is unchanged', async () => {
    const server = await boot(manifest());
    server.replaceActions('reports', { [daily.id]: daily });
    const served = server.charterReport();
    const inForce = server.actions();
    const held = await server.catalogOf(null);

    expect(() => server.replaceActions('reports', unservable)).toThrow(/^Refresh refused — charter incoherent over the new artifacts:\n {2}leaves-only: id "home" is a namespace of "home.sub"/);

    expect(server.charterReport()).toBe(served);
    expect(server.actions()).toBe(inForce);
    expect(Object.keys(server.actions())).toEqual(['home', 'admin.panel', 'stray', 'reports.daily']);
    expect(await server.catalogOf(null)).toBe(held);
    server.close();
  });
});

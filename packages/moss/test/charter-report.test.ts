import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { ActionDefinition } from '@niscorp/nova';
import { defineApp } from '../src/app';
import { createServer } from '../src/server';

// THE REPORT BOOT VERIFIED, HANDED BACK. `createServer` refuses on the report's
// errors and reads nothing else of it, so the warnings (an action no role
// grants, an allow that matches nothing) and each role's closure issues were
// computed on every boot and every refresh and then dropped. A host that
// wanted them had to run `verifyCharter` again, over a data universe it built
// by hand. `charterReport()` is the one the server itself verified.

const home: ActionDefinition = {
  id: 'home',
  triggers: [{ event: 'ui:click', ref: 'open', do: [{ push: { action: 'admin.panel' } }] }],
};
const panel: ActionDefinition = { id: 'admin.panel' };
const stray: ActionDefinition = { id: 'stray' };

const manifest = () =>
  defineApp({
    // `reports.*` matches nothing (a dead allow); `stray` is granted by nobody
    // (an orphan); `public` holds `home` but not the action it pushes.
    charter: { public: ['home', 'reports.*'], admin: ['home', 'admin.panel'] },
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

  it('is replaced by a refresh that passes', async () => {
    const app = manifest();
    const server = await boot(app);
    expect(server.charterReport().warnings.some((warning) => warning.rule === 'orphan')).toBe(true);

    app.actions = { home, 'admin.panel': panel };
    server.refresh();

    expect(server.charterReport().warnings.map((warning) => warning.rule)).toEqual(['dead-allow']);
    server.close();
  });

  it('a refresh that is refused leaves the report the server is still serving on', async () => {
    const app = manifest();
    const server = await boot(app);
    const served = server.charterReport();

    // A deny that matches nothing is an error: the refresh throws, and the old
    // resolution — with the report it was verified by — keeps serving.
    app.charter = { ...app.charter, admin: { allow: ['home', 'admin.panel'], deny: ['hmoe'] } };
    expect(() => server.refresh()).toThrow(/dead-deny/);

    expect(server.charterReport()).toBe(served);
    server.close();
  });
});

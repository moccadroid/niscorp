import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `nisc migrate`, run as the command against two fixtures: one that hands over
// neither the manifest nor the environment, and one that hands over both on a
// stand-in database that says what was done to it (fixtures/migrates). What the
// step decides is moss's (`migrateTables`), and held there on a real one.

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, '..', 'bin', 'nisc.js');
// each run is a process
const SLOW = 60_000;

const migrate = (fixture: string, args: readonly string[] = [], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [bin, 'migrate', '--root', join(here, 'fixtures', fixture), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

describe('nisc migrate', () => {
  it('says what a config is missing, and exits 1', () => {
    const run = migrate('own-shell');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('`nisc migrate` needs `app` and `runtime` in nisc.config.ts');
  }, SLOW);

  it('applies, says what it applied, and lets the environment go', () => {
    const run = migrate('migrates');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/nisc: applied \d+\n/);
    expect(run.stdout).toContain('  fixture.app/1  things');
    expect(run.stdout).toContain('fixture: committed');
    expect(run.stdout).toContain('fixture: let go');
  }, SLOW);

  it('--check does all of it and commits nothing', () => {
    const run = migrate('migrates', ['--check']);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/nisc: would apply \d+ — rolled back, nothing changed/);
    expect(run.stdout).toContain('  fixture.app/1  things');
    expect(run.stdout).toContain('fixture: rolled back');
    expect(run.stdout).not.toContain('fixture: committed');
  }, SLOW);

  it('a refusal exits 1 and names the entry; nothing is committed, and the environment is still let go', () => {
    const run = migrate('migrates', [], { NISC_FIXTURE_FAULT: 'misfit' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('notes/all: ');
    expect(run.stdout).toContain('fixture: rolled back');
    expect(run.stdout).not.toContain('fixture: committed');
    expect(run.stdout).toContain('fixture: let go');
  }, SLOW);
});

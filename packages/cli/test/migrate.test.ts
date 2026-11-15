import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NISC } from './nisc';

const here = dirname(fileURLToPath(import.meta.url));
const SLOW = 60_000;

const migrate = (fixture: string, args: readonly string[] = [], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [...NISC, 'migrate', '--root', join(here, 'fixtures', fixture), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

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

  it('--status reads what is applied and what is pending, and opens no transaction', () => {
    const run = migrate('migrates', ['--status']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('nisc: applied nisc.moss 0, nisc.moss.sessions 0, nisc.vex.cache 0, fixture.app 0');
    expect(run.stdout).toMatch(/nisc: \d+ pending\n/);
    expect(run.stdout).toContain('  fixture.app/1  things');
    expect(run.stdout).not.toContain('fixture: committed');
    expect(run.stdout).not.toContain('fixture: rolled back');
    expect(run.stdout).toContain('fixture: let go');
  }, SLOW);

  const EMPTY_EVERY_TIME = "nisc: this runtime's database starts empty every time (migrations: 'apply') — what is applied here is gone when the command ends. A real database is migrated by pointing runtime at it.";

  it.each([[[]], [['--check']], [['--status']]])('%j on a database that starts empty every time says so first, and runs as before', (args) => {
    const run = migrate('migrates', args, { NISC_FIXTURE_MIGRATIONS: 'apply' });
    expect(run.status).toBe(0);
    expect(run.stdout.startsWith(`${EMPTY_EVERY_TIME}\n`)).toBe(true);
    expect(run.stdout).toContain('  fixture.app/1  things');
  }, SLOW);

  it('a database that lasts is not told so', () => {
    expect(migrate('migrates').stdout).not.toContain('starts empty every time');
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

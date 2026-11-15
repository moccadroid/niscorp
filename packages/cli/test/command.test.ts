import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NISC } from './nisc';

const SLOW = 60_000;
const TSX = "console.log(`ran ${process.argv.slice(2).join(' ')} in ${process.cwd()}`);\nprocess.exit(Number(process.env['NISC_FIXTURE_CODE'] ?? 0));\n";

let app = '';

beforeEach(() => {
  app = mkdtempSync(join(tmpdir(), 'nisc-command-'));
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'nisc-fixture-command', private: true, type: 'module' }));
  mkdirSync(join(app, 'node_modules', 'tsx'), { recursive: true });
  writeFileSync(join(app, 'node_modules', 'tsx', 'package.json'), JSON.stringify({ name: 'tsx', version: '0.0.0', bin: { tsx: 'cli.mjs' } }));
  writeFileSync(join(app, 'node_modules', 'tsx', 'cli.mjs'), TSX);
});

afterEach(() => rmSync(app, { recursive: true, force: true }));

const configWith = (fields: string): void =>
  writeFileSync(join(app, 'nisc.config.ts'), `export const project = { shell: async () => ({ shell: null }), draw: () => '', adopt: () => undefined, ${fields} };\n`);

const nisc = (args: readonly string[], env: Record<string, string> = {}): { code: number | null; out: string } => {
  const result = spawnSync(process.execPath, [...NISC, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
};

describe('nisc check — the app’s suite, with the app’s own tsx', () => {
  it('runs src/dev/all-checks.ts from the app’s folder, and its exit code is the suite’s', () => {
    configWith('');
    const { code, out } = nisc(['check', '--root', app]);
    expect(out).toContain(`ran src/dev/all-checks.ts in ${app}`);
    expect(code).toBe(0);
  }, SLOW);

  it('runs the suite `checks` names, and a failing suite fails the command with its code', () => {
    configWith("checks: 'dev/suite.ts'");
    const { code, out } = nisc(['check', '--root', app], { NISC_FIXTURE_CODE: '3' });
    expect(out).toContain('ran dev/suite.ts');
    expect(code).toBe(3);
  }, SLOW);
});

describe('nisc — the command line', () => {
  it.each([[[]], [['help']], [['--help']]])('%j prints what each command does, and succeeds', (args) => {
    const { code, out } = nisc(args);
    expect(out).toContain('nisc export');
    expect(code).toBe(0);
  }, SLOW);

  it('a command it does not know prints the same, and fails', () => {
    const { code, out } = nisc(['deploy']);
    expect(out).toContain('nisc export');
    expect(code).toBe(1);
  }, SLOW);

  it('--root is where the app is; without it, the folder the command runs in', () => {
    configWith('');
    const result = spawnSync(process.execPath, [...NISC, 'check'], { cwd: app, encoding: 'utf8' });
    expect(result.stdout).toContain(`ran src/dev/all-checks.ts in ${app}`);
    expect(result.status).toBe(0);
  }, SLOW);
});

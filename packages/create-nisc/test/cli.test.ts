import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const BIN = join(import.meta.dirname, '..', 'bin', 'create-nisc.js');

let scratch = '';
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'create-nisc-cli-'));
});
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

const create = (args: readonly string[]): { code: number | null; out: string; err: string } => {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd: scratch, encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
};

describe('npm create nisc — the command line', () => {
  it('--yes makes the default app in the folder given, and says what comes next', () => {
    const { code, out } = create(['my-app', '--yes']);
    expect(code).toBe(0);
    expect(out).toContain('create-nisc: my-app — ');
    expect(out).toMatch(/\ncd my-app\n(npm|pnpm|yarn|bun) install\n\1 run dev\n/);
    expect(existsSync(join(scratch, 'my-app', 'package.json'))).toBe(true);
  });

  it('--help prints every flag, and makes nothing', () => {
    const { code, out } = create(['--help']);
    expect(code).toBe(0);
    expect(out).toContain('--model-first');
    expect(readdirSync(scratch)).toEqual([]);
  });

  it.each([
    [['app', '--nonsense'], 'create-nisc: unknown option --nonsense'],
    [['one', 'two'], 'create-nisc: one folder at a time — got one, two'],
    [['app', '--react', '--dom'], 'create-nisc: --react and --dom are two different apps; pick one'],
    [['app', '--model-first', '--page'], 'create-nisc: --model-first needs --moss, not --page'],
    [['Bad'], 'create-nisc: "bad" cannot be a package name'],
  ])('%j is refused with a sentence and the usage, and makes nothing', (args, said) => {
    const { code, err } = create(args);
    expect(err.toLowerCase()).toContain(said.toLowerCase());
    expect(err).toContain('npm create nisc [dir]');
    expect(code).toBe(1);
    expect(readdirSync(scratch)).toEqual([]);
  });

  it('a folder that is a file is refused with a sentence, before anything is asked', () => {
    writeFileSync(join(scratch, 'taken'), 'mine');
    const { code, err } = create(['taken', '--yes']);
    expect(err).toContain(`create-nisc: ${join(scratch, 'taken')} is a file, and the app needs a folder there. Make it somewhere else.`);
    expect(err).not.toContain('ENOTDIR');
    expect(code).toBe(1);
  });
});

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NISC } from './nisc';

const SLOW = 60_000;
const BOOT_FAILS = [
  "export const project = {",
  "  boot: async () => {",
  "    throw new Error('the database is not there');",
  '  },',
  "  draw: () => '',",
  "  dist: 'built',",
  '};',
  '',
].join('\n');

let app = '';

beforeEach(() => {
  app = mkdtempSync(join(tmpdir(), 'nisc-errors-'));
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'nisc-fixture-errors', private: true, type: 'module' }));
  mkdirSync(join(app, 'built'));
  writeFileSync(join(app, 'built', 'index.html'), '<!doctype html><html><head></head><body><div id="root"></div></body></html>');
});

afterEach(() => rmSync(app, { recursive: true, force: true }));

const nisc = (args: readonly string[]): { code: number | null; err: string } => {
  const result = spawnSync(process.execPath, [...NISC, ...args, '--root', app], { encoding: 'utf8' });
  return { code: result.status, err: result.stderr };
};

describe('what the command says when something fails', () => {
  it("an error thrown by the app's own code says where it was thrown", () => {
    writeFileSync(join(app, 'nisc.config.ts'), BOOT_FAILS);
    const { code, err } = nisc(['build', '--skip-bundle']);
    expect(err).toContain('the database is not there');
    expect(err).toMatch(/nisc\.config\.ts:3:\d+/);
    expect(code).toBe(1);
  }, SLOW);

  it("the command's own refusal is its sentence alone", () => {
    const { code, err } = nisc(['build', '--skip-bundle']);
    expect(err.trim()).toBe(`nisc: no nisc.config.ts in ${app}. It exports \`project\`: how the app boots, and how one of its screens is drawn.`);
    expect(code).toBe(1);
  }, SLOW);
});

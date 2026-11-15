import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linkPackage, NISC } from './nisc';

const OWN_SHELL = join(import.meta.dirname, 'fixtures', 'own-shell');
const SLOW = 60_000;

let scratch = '';
let app = '';

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'nisc-out-'));
  app = join(scratch, 'app');
  cpSync(join(OWN_SHELL, 'built'), join(app, 'built'), { recursive: true });
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'nisc-fixture-out', private: true, type: 'module' }));
  linkPackage(app, 'jsdom');
  writeFileSync(join(app, 'nisc.config.ts'), `export { project } from ${JSON.stringify(pathToFileURL(join(OWN_SHELL, 'nisc.config.ts')).href)};\n`);
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

const exportTo = (out: string): { code: number | null; out: string } => {
  const result = spawnSync(process.execPath, [...NISC, 'export', '--skip-bundle', '--root', app, '--out', out], { encoding: 'utf8' });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
};

describe('nisc export --out — the export empties its own folder and nothing else', () => {
  it.each([
    ['.', 'the app'],
    ['..', 'the folder above the app'],
    ['built', 'the built app'],
    [join('built', 'assets'), 'a folder inside the built app'],
  ])('--out %s (%s) is refused, and the app and its build are still there', (out) => {
    const { code, out: said } = exportTo(out);
    expect(said).toContain('nisc: --out');
    expect(said).toContain('Nothing was written.');
    expect(code).toBe(1);
    expect(existsSync(join(app, 'nisc.config.ts'))).toBe(true);
    expect(existsSync(join(app, 'built', 'index.html'))).toBe(true);
    expect(existsSync(join(app, 'built', 'assets', 'app.js'))).toBe(true);
  }, SLOW);

  it('a folder of its own is replaced whole: what an earlier export left is gone', () => {
    expect(exportTo('out').code).toBe(0);
    writeFileSync(join(app, 'out', 'left-over.html'), 'old');
    expect(exportTo('out').code).toBe(0);
    expect(existsSync(join(app, 'out', 'left-over.html'))).toBe(false);
    expect(existsSync(join(app, 'out', 'rooms', 'index.html'))).toBe(true);
  }, SLOW);
});

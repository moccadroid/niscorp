import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

const recordFile = (): string => join(app, 'node_modules', '.cache', 'nisc', 'exports.json');

describe('nisc export --out — the default folder is emptied; a named one loses only what the last export wrote', () => {
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

  it('a link to the app is refused by where it points, and the app is as it was', () => {
    symlinkSync(app, join(scratch, 'to-app'), 'junction');
    const { code, out: said } = exportTo(join('..', 'to-app'));
    expect(said).toContain("is the app's folder");
    expect(code).toBe(1);
    expect(readdirSync(app).sort()).toEqual(['built', 'nisc.config.ts', 'node_modules', 'package.json']);
  }, SLOW);

  it('the default folder is replaced whole, by any spelling of it: what an earlier export left is gone', () => {
    expect(exportTo('out').code).toBe(0);
    writeFileSync(join(app, 'out', 'left-over.html'), 'old');
    const { code, out: said } = exportTo(join(app, 'out'));
    expect(code).toBe(0);
    expect(existsSync(join(app, 'out', 'left-over.html'))).toBe(false);
    expect(existsSync(join(app, 'out', 'rooms', 'index.html'))).toBe(true);
    expect(said).not.toContain('not written by this export');
    expect(existsSync(recordFile())).toBe(false);
  }, SLOW);

  it('a folder named with --out keeps what the export did not write, and names it', () => {
    const sibling = join(scratch, 'sibling');
    mkdirSync(join(sibling, '.git'), { recursive: true });
    writeFileSync(join(sibling, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(sibling, 'notes.txt'), 'mine');
    const { code, out: said } = exportTo(join('..', 'sibling'));
    expect(code).toBe(0);
    expect(readFileSync(join(sibling, '.git', 'HEAD'), 'utf8')).toBe('ref: refs/heads/main\n');
    expect(readFileSync(join(sibling, 'notes.txt'), 'utf8')).toBe('mine');
    expect(existsSync(join(sibling, 'index.html'))).toBe(true);
    expect(existsSync(join(sibling, 'rooms', 'index.html'))).toBe(true);
    expect(existsSync(join(sibling, 'assets', 'app.js'))).toBe(true);
    expect(said).toContain(`nisc: left as they were in ${sibling}, not written by this export (2): .git/, notes.txt`);
    expect(readdirSync(sibling).filter((name) => name.startsWith('.nisc-export-'))).toEqual([]);
  }, SLOW);

  it('a second export into the same folder removes what the first wrote and the build no longer has, and replaces the rest', () => {
    const site = join(scratch, 'site');
    expect(exportTo(site).code).toBe(0);
    expect(existsSync(join(site, 'robots.txt'))).toBe(true);
    writeFileSync(join(site, 'index.html'), 'old');
    writeFileSync(join(site, 'notes.txt'), 'mine');
    rmSync(join(app, 'built', 'robots.txt'));
    const { code, out: said } = exportTo(site);
    expect(code).toBe(0);
    expect(existsSync(join(site, 'robots.txt'))).toBe(false);
    expect(readFileSync(join(site, 'index.html'), 'utf8')).toContain('Rooms &amp; &lt;suites&gt;');
    expect(readFileSync(join(site, 'notes.txt'), 'utf8')).toBe('mine');
    expect(said).toContain(`nisc: left as they were in ${site}, not written by this export (1): notes.txt`);
  }, SLOW);

  it('a file where the export writes a folder is replaced by it', () => {
    const site = join(scratch, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'rooms'), 'a file');
    expect(exportTo(site).code).toBe(0);
    expect(existsSync(join(site, 'rooms', 'index.html'))).toBe(true);
  }, SLOW);

  it('a folder with files of its own where the export writes a file is said, and nothing is written', () => {
    const site = join(scratch, 'site');
    mkdirSync(join(site, 'robots.txt'), { recursive: true });
    writeFileSync(join(site, 'robots.txt', 'mine.txt'), 'mine');
    const { code, out: said } = exportTo(site);
    expect(said).toContain('stands where the export writes a file');
    expect(said).toContain('robots.txt. Nothing was written.');
    expect(code).toBe(1);
    expect(readFileSync(join(site, 'robots.txt', 'mine.txt'), 'utf8')).toBe('mine');
    expect(readdirSync(site)).toEqual(['robots.txt']);
  }, SLOW);

  it('a link in the folder is removed as a link: nothing is written or removed where it points', () => {
    const site = join(scratch, 'site');
    const elsewhere = join(scratch, 'elsewhere');
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, 'keep.txt'), 'mine');
    writeFileSync(join(elsewhere, 'app.js'), 'mine too');
    mkdirSync(site);
    symlinkSync(elsewhere, join(site, 'assets'), 'junction');
    expect(exportTo(site).code).toBe(0);
    expect(readdirSync(elsewhere).sort()).toEqual(['app.js', 'keep.txt']);
    expect(readFileSync(join(elsewhere, 'app.js'), 'utf8')).toBe('mine too');
    expect(lstatSync(join(site, 'assets')).isSymbolicLink()).toBe(false);
    expect(existsSync(join(site, 'assets', 'app.js'))).toBe(true);

    rmSync(join(site, 'assets'), { recursive: true });
    symlinkSync(elsewhere, join(site, 'assets'), 'junction');
    const { code, out: said } = exportTo(site);
    expect(code).toBe(0);
    expect(readdirSync(elsewhere).sort()).toEqual(['app.js', 'keep.txt']);
    expect(readFileSync(join(elsewhere, 'app.js'), 'utf8')).toBe('mine too');
    expect(said).toContain(`nisc: not removed, as its real location is not inside ${site}: assets/app.js`);
  }, SLOW);

  it('a record edited to name a path outside the folder removes nothing outside it', () => {
    const site = join(scratch, 'site');
    expect(exportTo(site).code).toBe(0);
    const beside = join(scratch, 'beside.txt');
    const config = join(app, 'nisc.config.ts');
    writeFileSync(beside, 'mine');
    const record: unknown = JSON.parse(readFileSync(recordFile(), 'utf8'));
    const key = realpathSync.native(site);
    const written: unknown = record !== null && typeof record === 'object' ? Reflect.get(record, key) : undefined;
    expect(Array.isArray(written)).toBe(true);
    writeFileSync(recordFile(), JSON.stringify({ [key]: [...(Array.isArray(written) ? written : []), '../beside.txt', '../app/nisc.config.ts', config, '.', '..'] }));
    const { code, out: said } = exportTo(site);
    expect(code).toBe(0);
    expect(readFileSync(beside, 'utf8')).toBe('mine');
    expect(existsSync(config)).toBe(true);
    expect(existsSync(join(site, 'index.html'))).toBe(true);
    expect(said).toContain('../beside.txt');
    expect(said).toContain('../app/nisc.config.ts');
  }, SLOW);

  it('a file named with --out is said, and stays as it was', () => {
    const file = join(scratch, 'site');
    writeFileSync(file, 'mine');
    const { code, out: said } = exportTo(file);
    expect(said).toContain(`nisc: --out ${file} is a file, not a folder. Nothing was written.`);
    expect(code).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe('mine');
  }, SLOW);

  it('names the system accepts export, and the next export replaces them', () => {
    writeFileSync(
      join(app, 'nisc.config.ts'),
      `import { project as base } from ${JSON.stringify(pathToFileURL(join(OWN_SHELL, 'nisc.config.ts')).href)};\nexport const project = { ...base, paths: () => ['/', '/about.', '/about ', '/con'] };\n`,
    );
    const site = join(scratch, 'site');
    expect(exportTo(site).code).toBe(0);
    const { code, out: said } = exportTo(site);
    expect(code).toBe(0);
    expect(readdirSync(site)).toEqual(expect.arrayContaining(['about.', 'about ', 'con']));
    for (const name of ['about.', 'about ', 'con']) expect(readdirSync(join(site, name))).toEqual(['index.html']);
    expect(said).not.toContain('not written by this export');
    expect(said).not.toContain('not removed');
  }, SLOW);
});

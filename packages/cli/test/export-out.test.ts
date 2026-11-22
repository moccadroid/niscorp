import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, watch, writeFileSync } from 'node:fs';
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

const exportTo = (out?: string): { code: number | null; out: string } => {
  const result = spawnSync(process.execPath, [...NISC, 'export', '--skip-bundle', '--root', app, ...(out === undefined ? [] : ['--out', out])], { encoding: 'utf8' });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
};

const recordFile = (): string => join(app, 'node_modules', '.cache', 'nisc', 'exports.json');

const modeOf = (path: string): number => statSync(path).mode & 0o777;

const aFolderModeHere = (): number => {
  const probe = join(scratch, 'mode-probe');
  mkdirSync(probe, { recursive: true });
  return modeOf(probe);
};

const deadPid = (): number => {
  const ended = spawnSync(process.execPath, ['-e', '']);
  expect(ended.pid).toBeGreaterThan(0);
  return ended.pid ?? 0;
};

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

  it('the default folder gets the modes a folder made here gets, and nothing is left beside it', () => {
    expect(exportTo().code).toBe(0);
    expect(modeOf(join(app, 'out'))).toBe(aFolderModeHere());
    expect(modeOf(join(app, 'out', 'assets'))).toBe(aFolderModeHere());
    expect(readdirSync(app).sort()).toEqual(['built', 'nisc.config.ts', 'node_modules', 'out', 'package.json']);
  }, SLOW);

  it('a default folder that is a link to the folder above the app is replaced as before: the link goes, nothing above is touched', () => {
    symlinkSync(scratch, join(app, 'out'), 'junction');
    const { code } = exportTo();
    expect(code).toBe(0);
    expect(lstatSync(join(app, 'out')).isSymbolicLink()).toBe(false);
    expect(existsSync(join(app, 'out', 'rooms', 'index.html'))).toBe(true);
    expect(readdirSync(scratch).sort()).toEqual(['app']);
  }, SLOW);

  it.runIf(process.platform === 'win32' || process.platform === 'darwin')('--out OUT where the system does not tell case apart is the default folder', () => {
    expect(exportTo().code).toBe(0);
    writeFileSync(join(app, 'out', 'left-over.html'), 'old');
    const { code, out: said } = exportTo('OUT');
    expect(code).toBe(0);
    expect(existsSync(join(app, 'out', 'left-over.html'))).toBe(false);
    expect(said).not.toContain('not written by this export');
    expect(existsSync(recordFile())).toBe(false);
  }, SLOW);

  it('a new folder named with --out gets the modes a folder made here gets', () => {
    const site = join(scratch, 'site');
    expect(exportTo(site).code).toBe(0);
    expect(modeOf(site)).toBe(aFolderModeHere());
    expect(modeOf(join(site, 'assets'))).toBe(aFolderModeHere());
  }, SLOW);

  it('a fresh folder an ended export left in a named folder is removed by the next export, and not named', () => {
    const site = join(scratch, 'site');
    const left = join(site, `.nisc-export-${deadPid()}-0`);
    mkdirSync(join(left, 'assets'), { recursive: true });
    writeFileSync(join(left, 'assets', 'app.js'), 'half');
    const { code, out: said } = exportTo(site);
    expect(code).toBe(0);
    expect(existsSync(left)).toBe(false);
    expect(said).not.toContain('not written by this export');
  }, SLOW);

  it('a record that cannot be written does not fail the export: it is said, and nothing of the folder is lost', () => {
    const site = join(scratch, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'notes.txt'), 'mine');
    writeFileSync(join(app, 'node_modules', '.cache'), 'a file where the cache folder goes');
    const { code, out: said } = exportTo(site);
    expect(code).toBe(0);
    expect(existsSync(join(site, 'rooms', 'index.html'))).toBe(true);
    expect(readFileSync(join(site, 'notes.txt'), 'utf8')).toBe('mine');
    expect(said).toContain('nisc: what this export wrote could not be recorded');
    expect(said).toContain('the next export into');
  }, SLOW);

  it('the record is never written through a link', () => {
    const elsewhere = join(scratch, 'elsewhere');
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(app, 'node_modules', '.cache'), 'junction');
    const { code, out: said } = exportTo(join(scratch, 'site'));
    expect(code).toBe(0);
    expect(readdirSync(elsewhere)).toEqual([]);
    expect(said).toContain('nisc: what this export wrote could not be recorded');
  }, SLOW);

  it.runIf(process.platform === 'win32')('a file the system will not let the export replace is said, with what is left', () => {
    const site = join(scratch, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'index.html'), 'mine');
    chmodSync(join(site, 'index.html'), 0o444);
    try {
      const { code, out: said } = exportTo(site);
      expect(code).toBe(1);
      expect(said).toContain(`nisc: the export could not be moved into ${site}`);
      expect(said).toContain(`on ${join(site, 'index.html')}). 1 of its 4 files are in place and 3 are not; the previous export's files are removed. Export again to finish.`);
      expect(said).not.toContain('    at ');
    } finally {
      chmodSync(join(site, 'index.html'), 0o666);
    }
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

describe('nisc export — every file is made in a fresh folder before any folder is touched', () => {
  const withPaths = (paths: readonly string[]): void => {
    writeFileSync(
      join(app, 'nisc.config.ts'),
      `import { project as base } from ${JSON.stringify(pathToFileURL(join(OWN_SHELL, 'nisc.config.ts')).href)};
export const project = { ...base, paths: () => ${JSON.stringify(paths)} };
`,
    );
  };
  const filesIn = (folder: string): string[] => (existsSync(folder) ? readdirSync(folder, { recursive: true, encoding: 'utf8' }).sort() : []);

  it.runIf(process.platform === 'win32')('a path the system cannot make is said, and neither out/ nor a named folder is touched', () => {
    expect(exportTo().code).toBe(0);
    const site = join(scratch, 'site');
    expect(exportTo(site).code).toBe(0);
    writeFileSync(join(site, 'notes.txt'), 'mine');
    const [before, siteBefore] = [filesIn(join(app, 'out')), filesIn(site)];
    withPaths(['/', '/a:b']);
    for (const out of [undefined, site]) {
      const { code, out: said } = exportTo(out);
      expect(said).toContain('nisc: the path "/a:b" cannot be written here (ENOENT). Nothing was written.');
      expect(said).not.toContain('    at ');
      expect(code).toBe(1);
    }
    expect(filesIn(join(app, 'out'))).toEqual(before);
    expect(filesIn(site)).toEqual(siteBefore);
    expect(readdirSync(app).sort()).toEqual(['built', 'nisc.config.ts', 'node_modules', 'out', 'package.json']);
  }, SLOW);

  it.runIf(process.platform === 'win32')('a path whose file would land outside the export is refused, and nothing is written anywhere', () => {
    withPaths(['/', '/z\\..\\..\\escape']);
    const site = join(scratch, 'site', 'sub');
    for (const out of [undefined, site]) {
      const { code, out: said } = exportTo(out);
      expect(said).toContain('nisc: the path "/z\\..\\..\\escape" cannot be written here (its file would be outside');
      expect(code).toBe(1);
    }
    expect(existsSync(join(app, 'out'))).toBe(false);
    expect(existsSync(join(app, 'escape'))).toBe(false);
    expect(filesIn(join(scratch, 'site'))).toEqual(['sub']);
    expect(readdirSync(scratch).sort()).toEqual(['app', 'site']);
  }, SLOW);

  it.runIf(process.platform !== 'win32')('a name the system accepts is written as today: /a:b is a:b/index.html', () => {
    withPaths(['/', '/a:b']);
    expect(exportTo().code).toBe(0);
    expect(readdirSync(join(app, 'out', 'a:b'))).toEqual(['index.html']);
  }, SLOW);

  it('a failed export leaves no fresh folder behind, in the app or in the named folder', () => {
    withPaths(['/', '/a', '/a/index.html']);
    const site = join(scratch, 'site');
    for (const out of [undefined, site]) {
      const { code, out: said } = exportTo(out);
      expect(said).toMatch(/nisc: the path "\/a(\/index\.html)?" cannot be written here \(E[A-Z]+\)\. Nothing was written\./);
      expect(code).toBe(1);
    }
    expect(readdirSync(app).sort()).toEqual(['built', 'nisc.config.ts', 'node_modules', 'package.json']);
    expect(readdirSync(site)).toEqual([]);
  }, SLOW);

  it.runIf(process.platform !== 'win32')('a write that fails for another reason than the path is said as such, not blamed on the path', () => {
    mkdirSync(join(app, 'built', 'locked'));
    writeFileSync(join(app, 'built', 'locked', 'index.html'), 'the build’s own');
    chmodSync(join(app, 'built', 'locked', 'index.html'), 0o444);
    withPaths(['/', '/locked']);
    const { code, out: said } = exportTo();
    expect(said).toContain(`nisc: the export could not be written into ${join(app, 'out')} (EACCES on `);
    expect(said).not.toContain('cannot be written here');
    expect(code).toBe(1);
  }, SLOW);

  it('an export killed while its fresh folder is being written leaves nothing in the app’s folder, and the next export removes what it left', async () => {
    mkdirSync(join(app, 'built', 'many'));
    for (let file = 0; file < 3000; file += 1) writeFileSync(join(app, 'built', 'many', `${file}.txt`), 'x'.repeat(2000));
    const cache = join(app, 'node_modules', '.cache', 'nisc');
    mkdirSync(cache, { recursive: true });
    const child = spawn(process.execPath, [...NISC, 'export', '--skip-bundle', '--root', app], { stdio: 'ignore' });
    const ended = new Promise((done) => child.once('exit', done));
    const watchers = [app, cache].map((folder) =>
      watch(folder, (_event, name) => {
        if (typeof name === 'string' && name.startsWith('.nisc-export-')) child.kill('SIGKILL');
      }),
    );
    await ended;
    for (const watcher of watchers) watcher.close();
    expect(readdirSync(app).filter((name) => name.startsWith('.nisc-export-'))).toEqual([]);
    expect(exportTo().code).toBe(0);
    expect(readdirSync(cache).filter((name) => name.startsWith('.nisc-export-'))).toEqual([]);
    expect(existsSync(join(app, 'out', 'many', '2999.txt'))).toBe(true);
  }, SLOW);
});

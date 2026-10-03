import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// `nisc build` WITH its bundle step — the built command, run against an app made
// here for the purpose: the own-shell fixture's app, and a stand-in for its
// bundler. The command finds "the app's own vite" from the app's root, so the
// app is given one: a script that writes what vite writes — an index.html that
// links a hashed stylesheet. What the command then does to that page is its own.
//
// The app lives under fixtures/ (its config imports the fixture's, and resolves
// the same packages) and is removed when the tests are done.
// ═══════════════════════════════════════════════════════════════

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, '..', 'bin', 'nisc.js');
const SLOW = 60_000;

const SHEET = '.rooms{color:rebeccapurple}';
const LINK = '<link rel="stylesheet" crossorigin href="/assets/index-FaKe1234.css">';
const PAGE = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>bundled</title>${LINK}</head><body><div id="root"></div></body></html>`;

// What stands in for vite: `vite build`, run from the app's root.
const BUNDLER = `
const { mkdirSync, writeFileSync } = require('node:fs');
if (process.argv[2] !== 'build') process.exit(2);
mkdirSync('built/assets', { recursive: true });
writeFileSync('built/assets/index-FaKe1234.css', ${JSON.stringify(SHEET)});
writeFileSync('built/index.html', ${JSON.stringify(PAGE)});
console.log('bundled');
`;

let app = '';

beforeAll(() => {
  app = mkdtempSync(join(here, 'fixtures', 'bundled-'));
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'nisc-fixture-bundled', private: true, type: 'module' }));
  writeFileSync(
    join(app, 'nisc.config.ts'),
    [
      "import { project as shell } from '../own-shell/nisc.config';",
      "import type { NiscShellProject } from '../../../src';",
      "export const project: NiscShellProject = { ...shell, ...(process.env['NISC_FIXTURE_STYLESHEET'] === 'file' ? { stylesheet: 'file' } : {}) };",
      '',
    ].join('\n'),
  );
  mkdirSync(join(app, 'node_modules', 'vite'), { recursive: true });
  writeFileSync(join(app, 'node_modules', 'vite', 'package.json'), JSON.stringify({ name: 'vite', version: '0.0.0', bin: { vite: 'bin.cjs' } }));
  writeFileSync(join(app, 'node_modules', 'vite', 'bin.cjs'), BUNDLER);
});

afterAll(() => rmSync(app, { recursive: true, force: true }));

const nisc = (args: readonly string[], env: Record<string, string> = {}): { code: number | null; out: string } => {
  const result = spawnSync(process.execPath, [bin, ...args, '--root', app], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
};
const built = (): string => readFileSync(join(app, 'built', 'index.html'), 'utf8');

describe('nisc build — the bundle, and then the stylesheet into the page', () => {
  it('writes the stylesheet the bundler linked into the page it wrote, says so, and every check still holds', () => {
    const { code, out } = nisc(['build']);
    expect(out).toContain('bundled');
    expect(out).toContain('nisc: /assets/index-FaKe1234.css is in the page (0.0 kB) — one response paints it');
    expect(out).toContain("`stylesheet: 'file'` in nisc.config.ts keeps it a file");
    expect(built()).toBe(PAGE.replace(LINK, `<style>${SHEET}</style>`));
    // the stylesheet's own file is still there
    expect(readFileSync(join(app, 'built', 'assets', 'index-FaKe1234.css'), 'utf8')).toBe(SHEET);
    expect(out).toContain('drawn · whole · same twice · adopted');
    expect(code).toBe(0);
  }, SLOW);

  it('…and what is exported carries it: the stylesheet and the screen, in one file', () => {
    const { code } = nisc(['export', '--out', join(app, 'out')]);
    expect(code).toBe(0);
    const page = readFileSync(join(app, 'out', 'rooms', 'index.html'), 'utf8');
    expect(page).toContain(`<style>${SHEET}</style>`);
    expect(page).not.toContain('rel="stylesheet"');
    expect(page).toContain('Rooms &amp; &lt;suites&gt;');
  }, SLOW);

  it("`stylesheet: 'file'` leaves the page as the bundler linked it, and says nothing", () => {
    const { code, out } = nisc(['build'], { NISC_FIXTURE_STYLESHEET: 'file' });
    expect(built()).toBe(PAGE);
    expect(out).not.toContain('is in the page');
    expect(out).toContain('drawn · whole · same twice · adopted');
    expect(code).toBe(0);
  }, SLOW);

  it('--skip-bundle takes the page as it is: whoever built it finished it', () => {
    // as the run above left it: the link, not the stylesheet
    const { code, out } = nisc(['build', '--skip-bundle']);
    expect(out).not.toContain('bundled');
    expect(built()).toBe(PAGE);
    expect(code).toBe(0);
  }, SLOW);

  it('says so when the app has files of its own under public/assets/', () => {
    expect(nisc(['build', '--skip-bundle']).out).not.toContain('public/assets/');
    mkdirSync(join(app, 'public', 'assets'), { recursive: true });
    writeFileSync(join(app, 'public', 'assets', 'logo.svg'), '<svg/>');
    const { code, out } = nisc(['build', '--skip-bundle']);
    expect(out).toContain('nisc: public/assets/ holds files of your own.');
    expect(out).toContain('keep everything under /assets/ for a year');
    // said, not refused
    expect(code).toBe(0);
  }, SLOW);

  it('a bundler that fails stops the build before anything is drawn', () => {
    writeFileSync(join(app, 'node_modules', 'vite', 'bin.cjs'), 'process.exit(1);');
    const { code, out } = nisc(['build']);
    expect(out).toContain('the bundler failed — nothing was drawn');
    expect(code).toBe(1);
  }, SLOW);
});

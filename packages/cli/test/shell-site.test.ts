import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { placeScreen } from '../src';
import { shellSite } from '../src/shell-site';
import { project } from './fixtures/own-shell/nisc.config';

// ═══════════════════════════════════════════════════════════════
// An app with its own shell, through the command as it is installed: the built
// `nisc`, run against a fixture app that has no moss in it (fixtures/own-shell —
// nova's DOM adapter, one file). Each check a build makes is seen to hold, and
// then seen to fail when the fixture is broken that one way.
// ═══════════════════════════════════════════════════════════════

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'fixtures', 'own-shell');
const bin = join(here, '..', 'bin', 'nisc.js');
const scratch = mkdtempSync(join(tmpdir(), 'nisc-own-shell-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// each run is a process (and a second one inside it, for the adoption check)
const SLOW = 60_000;

const nisc = (args: readonly string[], fault = ''): { code: number | null; out: string } => {
  const result = spawnSync(process.execPath, [bin, ...args, '--root', root, '--skip-bundle'], {
    encoding: 'utf8',
    env: { ...process.env, NISC_FIXTURE_FAULT: fault },
  });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
};

describe('nisc build — an app with its own shell', () => {
  it('draws every path, every check holds, and says what the first screen is made of', () => {
    const { code, out } = nisc(['build']);
    expect(out).toContain('drawn · whole · same twice · adopted');
    expect(out).toContain('opened with rooms.load (/api/rooms) — in the file as answered at build');
    expect(out).toContain('can still call rooms.load (/api/rooms), rooms.save (/api/rooms/save)');
    expect(out).toContain('waits on rooms-changed');
    expect(out).not.toMatch(/^✗ \//m);
    expect(code).toBe(0);
  }, SLOW);

  it('fails a screen that draws to nothing', () => {
    const { code, out } = nisc(['build'], 'empty');
    expect(out).toContain('drawn: it drew to nothing');
    expect(code).toBe(1);
  }, SLOW);

  it('fails a screen that is still loading when the wait runs out', () => {
    const { code, out } = nisc(['build'], 'slow');
    expect(out).toContain('whole: it was still loading after 400ms');
    expect(code).toBe(1);
  }, SLOW);

  it('fails a boot that does not draw the same thing twice, and says where they part', () => {
    const { code, out } = nisc(['build'], 'differs');
    expect(out).toContain('same twice: a second boot drew different markup — at character');
    expect(code).toBe(1);
  }, SLOW);

  it('fails markup the page’s own boot does not pick up clean', () => {
    const { code, out } = nisc(['build'], 'adopt');
    expect(out).toContain('adopted: what the page’s boot drew is not the markup it was handed');
    expect(out).not.toContain('same twice:');
    expect(code).toBe(1);
  }, SLOW);
});

describe('nisc export — an app with its own shell', () => {
  it('writes each path as a file holding its first screen', () => {
    const out = join(scratch, 'site');
    const { code } = nisc(['export', '--out', out]);
    expect(code).toBe(0);
    const index = readFileSync(join(out, 'index.html'), 'utf8');
    expect(index).toContain('<html lang="en" data-palette="dusk">');
    expect(index).toContain('Rooms &amp; &lt;suites&gt;');
    expect(index).toContain('data-ref="bump"');
    expect(index).toContain('<script type="module" src="/assets/app.js">');
    expect(readFileSync(join(out, 'rooms', 'index.html'), 'utf8')).toContain('Rooms &amp; &lt;suites&gt;');
  }, SLOW);

  it('writes nothing when a check did not hold', () => {
    const out = join(scratch, 'broken');
    const { code, out: said } = nisc(['export', '--out', out], 'adopt');
    expect(code).toBe(1);
    expect(said).toContain('Nothing was written.');
    expect(existsSync(out)).toBe(false);
  }, SLOW);
});

describe('nisc start — an app with its own shell', () => {
  // the handler `nisc start` listens with; no port is opened here
  const site = shellSite(project, join(root, 'built'));

  it('answers a path with its first screen, drawn from a boot of the app’s own', async () => {
    const response = await site(new Request('http://localhost/rooms'));
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('Rooms &amp; &lt;suites&gt;');
    expect(html).toContain('data-palette="dusk"');
  });

  it('answers a built file with the file, and a missing one with 404 — never a page', async () => {
    const file = await site(new Request('http://localhost/index.html'));
    expect(await file.text()).toContain('<div id="root">');
    expect((await site(new Request('http://localhost/assets/nope.js'))).status).toBe(404);
    // nothing above the built folder is reachable
    expect((await site(new Request('http://localhost/..%2Fnisc.config.ts'))).status).toBe(404);
  });
});

describe('placeScreen', () => {
  const template = '<html lang="en"><body><div id="root"></div></body></html>';

  it('puts the screen in the root and the attributes on <html>, escaped', () => {
    expect(placeScreen(template, '<p>hi</p>', { 'data-x': 'a"b' })).toBe('<html lang="en" data-x="a&quot;b"><body><div id="root"><p>hi</p></div></body></html>');
  });

  it('reads nothing in the screen as a replacement pattern', () => {
    expect(placeScreen(template, 'cost: $& $1 $$')).toContain('<div id="root">cost: $& $1 $$</div>');
  });
});

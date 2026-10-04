import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { shellSite } from '../src/shell-site';
import { project } from './fixtures/own-head/nisc.config';

// ═══════════════════════════════════════════════════════════════
// A head per path. An app with its own shell and more than one page
// (fixtures/own-head): the list at `/` says nothing about itself, and each
// article says what it is in its layout. Through the command as it is
// installed, each path's file goes out with its screen's own head — and a path
// whose screen has none, with the template's.
// ═══════════════════════════════════════════════════════════════

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'fixtures', 'own-head');
const bin = join(here, '..', 'bin', 'nisc.js');
const scratch = mkdtempSync(join(tmpdir(), 'nisc-own-head-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const SLOW = 60_000;

const nisc = (args: readonly string[], fault = ''): { code: number | null; out: string } => {
  const result = spawnSync(process.execPath, [bin, ...args, '--root', root, '--skip-bundle'], {
    encoding: 'utf8',
    env: { ...process.env, NISC_FIXTURE_FAULT: fault },
  });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
};

const headOf = (html: string): string => html.slice(0, html.indexOf('</head>'));

describe('nisc build — a head per path', () => {
  it('says whose head each path goes out with', () => {
    const { code, out } = nisc(['build']);
    expect(code).toBe(0);
    expect(out).toContain('head: its own, said by article');
    expect(out).toContain('head: the template’s own');
  }, SLOW);

  it('fails a boot that does not say the same head twice, and says where they part', () => {
    const { code, out } = nisc(['build'], 'head');
    expect(out).toContain('same twice: a second boot said a different head — at character');
    // the markup itself was the same both times
    expect(out).not.toContain('drew different markup');
    expect(code).toBe(1);
  }, SLOW);
});

describe('nisc export — a head per path', () => {
  const out = join(scratch, 'site');

  it('writes each article with its own title, description, address and preview tags, escaped', () => {
    expect(nisc(['export', '--out', out]).code).toBe(0);
    const head = headOf(readFileSync(join(out, 'articles', 'types', 'index.html'), 'utf8'));
    expect(head).toContain('<title data-own="The site">Types &amp; &lt;tags></title>');
    expect(head).toContain('<meta name="description" content="What a &quot;type&quot; can promise.">');
    expect(head).toContain('<link rel="canonical" href="https://example.com/articles/types/">');
    expect(head).toContain('<meta property="og:url" content="https://example.com/articles/types/">');
    expect(head).toContain('<meta property="og:type" content="article">');
    expect(head).toContain('<meta property="og:title" content="Types &amp; &lt;tags>">');
    expect(head).toContain('<meta property="og:image" content="https://example.com/covers/article.png">');
    expect(head).toContain('<script type="application/ld+json">{"@type":"Article","headline":"Types & \\u003ctags>"}</script>');
    // nothing of the front page's is left in it
    expect(head).not.toContain('Everything on the site.');
    expect(head).not.toContain('href="https://example.com/"');
    // and what the head did not speak of is as index.html has it
    expect(head).toContain('<link rel="icon" href="/favicon.svg" />');
    expect(head).toContain('<meta property="og:site_name" content="The site" />');
  }, SLOW);

  it('each path has its own — no two files say the same address', () => {
    const loops = headOf(readFileSync(join(out, 'articles', 'loops', 'index.html'), 'utf8'));
    expect(loops).toContain('<title data-own="The site">Loops</title>');
    expect(loops).toContain('<link rel="canonical" href="https://example.com/articles/loops/">');
  });

  it('a path whose screen has no head goes out with the template’s, at its own address', () => {
    const head = headOf(readFileSync(join(out, 'index.html'), 'utf8'));
    expect(head).toContain('<title>The site</title>');
    expect(head).toContain('<meta name="description" content="Everything on the site." />');
    expect(head).toContain('<link rel="canonical" href="https://example.com/">');
    expect(head).not.toContain('og:title');
  });
});

describe('nisc start — a head per path', () => {
  const site = shellSite(project, join(root, 'built'));

  it('answers each path with the head export writes for it', async () => {
    const out = join(scratch, 'served');
    expect(nisc(['export', '--out', out]).code).toBe(0);
    for (const [path, file] of [
      ['/', 'index.html'],
      ['/articles/types/', join('articles', 'types', 'index.html')],
    ] as const) {
      const served = await (await site(new Request(`http://localhost${path}`))).text();
      expect(served).toBe(readFileSync(join(out, file), 'utf8'));
    }
  }, SLOW);
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, describe, expect, it } from 'vitest';
import { stylesheetInPage, writeStylesheetIntoPage } from '../src/stylesheet';

// ═══════════════════════════════════════════════════════════════
// The stylesheet goes in the page: what moves, what is left alone and why, and
// that nothing a stylesheet says can break out of where it was put.
// ═══════════════════════════════════════════════════════════════

const page = (head: string): string => `<!doctype html><html lang="en"><head>${head}</head><body><div id="root"></div></body></html>`;
const files =
  (map: Record<string, string>) =>
  (href: string): string | undefined =>
    map[href];
// the link exactly as vite writes it
const VITE = '<link rel="stylesheet" crossorigin href="/assets/index-AbC12345.css">';
const SHEET = '/assets/index-AbC12345.css';

describe('stylesheetInPage', () => {
  it('turns the link the bundler wrote into a <style> holding the file', () => {
    const { html, inPage, left } = stylesheetInPage(page(VITE), files({ [SHEET]: '.a{color:red}' }));
    expect(html).toBe(page('<style>.a{color:red}</style>'));
    expect(inPage).toEqual([{ href: SHEET, bytes: 13 }]);
    expect(left).toEqual([]);
    // the empty root a screen is drawn into is still there, once
    expect(html.split('<div id="root"></div>')).toHaveLength(2);
  });

  it('reads nothing in a stylesheet as a replacement pattern', () => {
    const { html } = stylesheetInPage(page(VITE), files({ [SHEET]: '.a::before{content:"$& $1 $` $$"}' }));
    expect(html).toContain('content:"$& $1 $` $$"');
  });

  it('a stylesheet that says </style does not close the element it is in', () => {
    const css = '.b::after{content:"</style><script>window.broke=1</script>"}/*! </STYLE> */.c{color:blue}';
    const { html } = stylesheetInPage(page(VITE), files({ [SHEET]: css }));
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    expect(dom.window.document.querySelectorAll('script')).toHaveLength(0);
    expect(Reflect.get(dom.window, 'broke')).toBeUndefined();
    expect(dom.window.document.querySelectorAll('style')).toHaveLength(1);
    // all of it is inside, to the last rule
    expect(dom.window.document.querySelector('style')?.textContent).toContain('.c{color:blue}');
  });

  it('leaves alone a link that says more than where the file is, a file that is not the build’s, and every other kind of link', () => {
    const head = [
      '<link rel="stylesheet" href="https://fonts.example/css?family=X">',
      '<link rel="stylesheet" href="/print.css" media="print">',
      '<link rel="stylesheet" href="./assets/a.css">',
      '<link rel="stylesheet" crossorigin href="/sub/assets/a.css">',
      '<link rel="alternate stylesheet" href="/print.css" title="high contrast">',
      '<link rel="icon" href="/favicon.svg">',
      '<link rel="modulepreload" crossorigin href="/assets/x.js">',
    ].join('');
    const { html, inPage, left } = stylesheetInPage(page(head), files({ '/print.css': 'p{}', '/assets/a.css': 'a{}' }));
    expect(html).toBe(page(head));
    expect(inPage).toEqual([]);
    expect(left).toEqual([
      { href: 'https://fonts.example/css?family=X', why: 'it is not a path into the built folder' },
      { href: '/print.css', why: 'its link says more than where it is (media)' },
      { href: './assets/a.css', why: 'it is not a path into the built folder' },
      { href: '/sub/assets/a.css', why: 'it is not in the built folder' },
    ]);
  });

  it('leaves a stylesheet a file when moving it would change what it points at', () => {
    const moved = (css: string): boolean => stylesheetInPage(page(VITE), files({ [SHEET]: css })).inPage.length === 1;
    // these mean the same from a page at any path
    expect(moved(`a{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E")}`)).toBe(true);
    expect(moved(`a{background:url('data:image/svg+xml,<svg fill="rgb(0,0,0)"/>')}`)).toBe(true);
    expect(moved('a{src:url(/assets/f.woff2) format("woff2"),url(https://x/y.woff);fill:url(#g)}')).toBe(true);
    // these are relative to the stylesheet's own place
    expect(moved('a{src:url(f.woff2)}')).toBe(false);
    expect(moved('a{src:url("./f.woff2")}')).toBe(false);
    expect(moved("a{src:url( '../img/x.png' )}")).toBe(false);
    expect(moved('@import "/other.css";a{}')).toBe(false);

    const { html, left } = stylesheetInPage(page(VITE), files({ [SHEET]: 'a{src:url(f.woff2)}' }));
    expect(html).toBe(page(VITE));
    expect(left).toEqual([{ href: SHEET, why: 'it names a file relative to itself (f.woff2)' }]);
  });

  it('reads a link however a hand-written page spells it', () => {
    const read = files({ '/kit.css': 'k{}' });
    expect(stylesheetInPage(page("<link href='/kit.css' rel='stylesheet' />"), read).html).toBe(page('<style>k{}</style>'));
    expect(stylesheetInPage(page('<LINK REL="STYLESHEET" HREF="/kit.css">'), read).html).toBe(page('<style>k{}</style>'));
    expect(stylesheetInPage(page('<link rel=stylesheet href=/kit.css>'), read).html).toBe(page('<style>k{}</style>'));
  });

  it('done twice is done once', () => {
    const read = files({ [SHEET]: '.a{color:red}' });
    const once = stylesheetInPage(page(VITE), read);
    const twice = stylesheetInPage(once.html, read);
    expect(twice.html).toBe(once.html);
    expect(twice.inPage).toEqual([]);
  });
});

describe('writeStylesheetIntoPage', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'nisc-stylesheet-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const built = (name: string, html: string, sheets: Record<string, string>): string => {
    const dist = join(scratch, name);
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), html);
    for (const [file, css] of Object.entries(sheets)) writeFileSync(join(dist, file), css);
    return dist;
  };

  it('rewrites the built folder’s page where it stands, and leaves the stylesheet’s own file', () => {
    const dist = built('app', page(VITE), { 'assets/index-AbC12345.css': '.a{color:red}' });
    expect(writeStylesheetIntoPage(dist)).toEqual({ inPage: [{ href: SHEET, bytes: 13 }], left: [] });
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toBe(page('<style>.a{color:red}</style>'));
    expect(readFileSync(join(dist, 'assets/index-AbC12345.css'), 'utf8')).toBe('.a{color:red}');
    // again: nothing left to do
    expect(writeStylesheetIntoPage(dist)).toEqual({ inPage: [], left: [] });
  });

  it('reads nothing outside the built folder', () => {
    writeFileSync(join(scratch, 'secret.css'), 'secret{}');
    const html = page('<link rel="stylesheet" href="/../secret.css">');
    const dist = built('walled', html, {});
    expect(writeStylesheetIntoPage(dist).left).toEqual([{ href: '/../secret.css', why: 'it is not in the built folder' }]);
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toBe(html);
  });

  it('a folder with no page is nothing to do', () => {
    expect(writeStylesheetIntoPage(join(scratch, 'not-built'))).toEqual({ inPage: [], left: [] });
  });
});

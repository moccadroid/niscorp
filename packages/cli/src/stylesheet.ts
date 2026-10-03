import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// ═══════════════════════════════════════════════════════════════
// THE STYLESHEET GOES IN THE PAGE.
//
// A drawn page arrives as markup, and a browser paints none of it until it has
// the stylesheet. As a file of its own that is a second round trip before the
// first paint. So once the bundler is done, the page it wrote (`index.html`,
// the template every drawn page is made from) has each stylesheet it links
// written into it as a <style>, and one response paints the page.
//
// It is done ONCE, to the file in the built folder — every reader of that file
// (`build`, `export`, `start`, moss's document) then hands out the same head
// without knowing any of this. The stylesheet's own file stays where it is.
//
// A link is left as it is, and the build says so, when moving the stylesheet
// could change what it means: a link that says more than where the file is (a
// `media`, a `title`), a file that is not in the built folder, a stylesheet
// that names another file relative to itself.
// ═══════════════════════════════════════════════════════════════

// What became of each stylesheet link the page had.
export type StylesheetReport = {
  // now in the page: where it was linked from, and how much text that is
  inPage: readonly { href: string; bytes: number }[];
  // left as a file, and why
  left: readonly { href: string; why: string }[];
};

export type StylesheetRewrite = StylesheetReport & { html: string };

const attributesOf = (tag: string): Record<string, string> => {
  const found: Record<string, string> = {};
  // past `<link`
  for (const match of tag.slice(5).matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1];
    if (name !== undefined) found[name.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return found;
};

// what a link may say and still be only "this stylesheet, from here"
const PLAIN = new Set(['rel', 'href', 'crossorigin']);

// A url() that points at the same thing from a page at any path: an absolute
// path, a full address, a data: or blob: URI, a fragment.
const isPortableUrl = (url: string): boolean => url === '' || /^(\/|data:|blob:|https?:|#)/i.test(url);

// Why a stylesheet cannot move into a page — nothing, when it can.
const whyStylesheetStays = (css: string): string | undefined => {
  if (/@import\b/i.test(css)) return 'it imports another stylesheet';
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    const url = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!isPortableUrl(url)) return `it names a file relative to itself (${url})`;
  }
  return undefined;
};

// The page, with every stylesheet it links by a plain local path written into
// it. `read` answers a stylesheet's text by its href, or nothing when the built
// folder has no such file. Pure: a second pass over its own output changes
// nothing.
export const stylesheetInPage = (html: string, read: (href: string) => string | undefined): StylesheetRewrite => {
  const inPage: { href: string; bytes: number }[] = [];
  const left: { href: string; why: string }[] = [];
  const rewritten = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const attributes = attributesOf(tag);
    if ((attributes['rel'] ?? '').toLowerCase() !== 'stylesheet') return tag;
    const href = attributes['href'] ?? '';
    const stays = (why: string): string => {
      left.push({ href, why });
      return tag;
    };
    const extra = Object.keys(attributes).filter((name) => !PLAIN.has(name));
    if (extra.length > 0) return stays(`its link says more than where it is (${extra.join(', ')})`);
    if (!href.startsWith('/') || href.startsWith('//') || /[?#]/.test(href)) return stays('it is not a path into the built folder');
    const css = read(href);
    if (css === undefined) return stays('it is not in the built folder');
    const why = whyStylesheetStays(css);
    if (why !== undefined) return stays(why);
    inPage.push({ href, bytes: Buffer.byteLength(css) });
    // A <style> ends at the first `</style`, whatever CSS thinks it is inside.
    // `\/` is the same character to CSS, and not that to the HTML parser.
    return `<style>${css.replace(/<\/(style)/gi, '<\\/$1')}</style>`;
  });
  return { html: rewritten, inPage, left };
};

// The same, over the built folder: its index.html rewritten where it stands.
// Nothing to do (no page, no stylesheet link) is nothing done.
export const writeStylesheetIntoPage = (dist: string): StylesheetReport => {
  const page = join(dist, 'index.html');
  if (!existsSync(page)) return { inPage: [], left: [] };
  const base = resolve(dist);
  const read = (href: string): string | undefined => {
    const file = resolve(base, `.${href}`);
    return file.startsWith(base + sep) && existsSync(file) && statSync(file).isFile() ? readFileSync(file, 'utf8') : undefined;
  };
  const html = readFileSync(page, 'utf8');
  const rewrite = stylesheetInPage(html, read);
  if (rewrite.html !== html) writeFileSync(page, rewrite.html);
  return { inPage: rewrite.inPage, left: rewrite.left };
};

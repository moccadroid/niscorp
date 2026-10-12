import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export type StylesheetReport = {
  inPage: readonly { href: string; bytes: number }[];
  left: readonly { href: string; why: string }[];
};

export type StylesheetRewrite = StylesheetReport & { html: string };

const attributesOf = (tag: string): Record<string, string> => {
  const found: Record<string, string> = {};
  for (const match of tag.slice(5).matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1];
    if (name !== undefined) found[name.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return found;
};

const PLAIN = new Set(['rel', 'href', 'crossorigin']);

const isPortableUrl = (url: string): boolean => url === '' || /^(\/|data:|blob:|https?:|#)/i.test(url);

const whyStylesheetStays = (css: string): string | undefined => {
  if (/@import\b/i.test(css)) return 'it imports another stylesheet';
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    const url = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!isPortableUrl(url)) return `it names a file relative to itself (${url})`;
  }
  return undefined;
};

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

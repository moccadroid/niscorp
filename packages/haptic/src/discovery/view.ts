import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { isTag, type AnyNode, type Element } from 'domhandler';
import { fold } from '../artifact/fold.js';

const INLINE = new Set([
  'span',
  'b',
  'i',
  'em',
  'strong',
  'small',
  'abbr',
  'time',
  'code',
  'label',
  'sup',
  'sub',
  'mark',
  'u',
  's',
  'q',
  'cite',
  'font',
  'br',
  'img',
  'wbr',
]);
const HIDDEN = new Set(['script', 'style', 'noscript', 'template', 'svg']);
const collapse = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

export type Line = {
  number: number;
  element: Element;
  text: string;
  link: boolean;
  linkElement: Element | null;
};

// The page as the stage reader parses it, so rules found on it select the same elements at run time.
export const load = (html: string): CheerioAPI => cheerio.load(html);

const parentTag = (node: AnyNode): Element | null =>
  node.parent && isTag(node.parent) ? node.parent : null;

const isHidden = (element: Element) => {
  for (let node: Element | null = element; node; node = parentTag(node))
    if (HIDDEN.has(node.name)) return true;
  return false;
};

// A link belongs to its nearest block.
export const block = (link: Element): Element | null => {
  for (let node = parentTag(link); node; node = parentTag(node))
    if (node.name !== 'a' && !INLINE.has(node.name)) return node;
  return null;
};
const inSentence = (link: Element) => {
  const node = block(link);
  if (!node) return false;
  const other = (n: Element): boolean =>
    n.children.some(
      (c) =>
        (c.type === 'text' && c.data.trim() && c.parent !== link) ||
        (isTag(c) && c !== link && (INLINE.has(c.name) || c.name === 'a') && other(c)),
    );
  return other(node);
};
const ownLinks = ($: CheerioAPI, element: Element) =>
  $(element)
    .find('a[href]')
    .toArray()
    .filter((a) => block(a) === element);

// A block's line keeps all its words. One link of its own folds into that line; with several, each link also stands as its own line.
export const isLine = ($: CheerioAPI, element: Element): boolean => {
  if (element.name !== 'a') return !INLINE.has(element.name);
  const owner = block(element);
  return !(inSentence(element) && owner !== null && ownLinks($, owner).length === 1);
};

const ownText = ($: CheerioAPI, element: Element) => {
  let text = '';
  const walk = (node: Element) => {
    for (const child of node.children) {
      if (child.type === 'text') text += child.data;
      else if (!isTag(child) || HIDDEN.has(child.name)) continue;
      else if (!isLine($, child) || (child.name === 'a' && inSentence(child))) walk(child);
      else text += ' ';
    }
  };
  walk(element);
  return collapse(text);
};

// The text view: one numbered line per block, with its words; a line with one link of its own is a link line.
export const buildLines = ($: CheerioAPI): Line[] => {
  const lines: Line[] = [];
  $('body *').each((_, element) => {
    if (!isTag(element) || isHidden(element) || !isLine($, element)) return;
    const text = ownText($, element);
    if (!text) return;
    const own = element.name === 'a' && element.attribs.href ? element : null;
    const folded = own ? [] : ownLinks($, element).filter((a) => !isLine($, a));
    lines.push({
      number: lines.length + 1,
      element,
      text,
      link: Boolean(own) || folded.length === 1,
      linkElement: own ?? (folded.length === 1 ? (folded[0] ?? null) : null),
    });
  });
  return lines;
};

const target = (line: Line, base: string) => {
  if (line.element.name !== 'a') return '';
  try {
    const url = new URL(line.element.attribs.href ?? '', base);
    const page = new URL(base);
    const shown = url.origin === page.origin ? url.pathname + url.search : url.host + url.pathname;
    return ` [${shown.length > 70 ? `${shown.slice(0, 70)}…` : shown}]`;
  } catch {
    return '';
  }
};

export const renderLines = (lines: Line[], base: string | null): string =>
  lines
    .map(
      (line) =>
        `${line.number}${line.link ? ' →' : ''} ${line.text}${line.link && base ? target(line, base) : ''}`,
    )
    .join('\n');

// The deepest element inside the line whose text contains the cited text.
export const resolveText = ($: CheerioAPI, line: Line, text: string): Element | null => {
  const want = fold(text);
  if (!fold(line.text).includes(want)) return null;
  let best = line.element;
  const walk = (node: Element) => {
    for (const child of node.children) {
      if (!isTag(child) || isLine($, child)) continue;
      if (fold($(child).text()).includes(want)) {
        best = child;
        walk(child);
      }
    }
  };
  walk(line.element);
  return best;
};

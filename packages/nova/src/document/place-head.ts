import { headKeyOf } from '../layout/head';
import type { HeadElement } from '../layout/head';

// ═══════════════════════════════════════════════════════════
// A screen's head, written into an HTML document.
//
// The document is the app's own `index.html` with a screen already drawn into
// it. Its <head> is what holds on every page; the screen's head elements are
// what this page says. An element that says the same thing as a tag the
// document already has — its <title>, a <meta> of that name or property, its
// canonical address — takes that tag's place, where it stood. Anything else is
// added after what is there. Everything the screen does not speak of is left
// exactly as it was: the icon, the viewport, the stylesheet.
//
// TWO THINGS ARE KEPT FOR THE PAGE ITSELF, which goes on living after the file
// is read (./head-keeper). What was written is marked (`data-nova-head`), so
// the page can tell the screen's elements from the document's own. And a tag
// that gave up its place is kept, inert, in a <template data-nova-own>: when
// the screen moves on to one that no longer says it, the document's own comes
// back.
//
// WHERE the document lives is known to whoever writes the file: the site plus
// the path it was drawn at. With a `site`, every path is given its own
// canonical address, whether or not its screen has a head. That address is the
// document's own for this path — unmarked, and it stays when the screen moves
// on. A screen that says a canonical address itself is taken at its word.
//
// With nothing to write, the document comes back untouched.
// ═══════════════════════════════════════════════════════════

export type HeadPlace = {
  // The address the site is served at ("https://example.com"). With it, each
  // path's canonical address is written.
  site?: string;
  // The path this document was drawn at.
  path?: string;
};

export const HEAD_MARK = 'data-nova-head';
export const OWN_MARK = 'data-nova-own';

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Inside a <script>, the one thing that may not appear is the start of a tag.
// The two separators end a line in a script though not in JSON, so they are
// written as escapes too (named by code: the characters themselves would end
// a line here as well).
const LINE_ENDS = [0x2028, 0x2029];
const escapeScript = (json: string): string =>
  LINE_ENDS.reduce((text, code) => text.split(String.fromCharCode(code)).join(`\\u${code.toString(16)}`), json.replace(/</g, '\\u003c'));

// What stands in a head, read a tag at a time: comments and the bodies of
// scripts, styles and templates are passed over whole, so a tag written inside
// one is not mistaken for a tag.
const ATTRIBUTES = `((?:[^>"']|"[^"]*"|'[^']*')*)`;
const TAGS = new RegExp(`<!--[\\s\\S]*?-->|<(script|style|title|template)\\b${ATTRIBUTES}>([\\s\\S]*?)<\\/\\1\\s*>|<(meta|link)\\b${ATTRIBUTES}>`, 'gi');
const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

type Tag = { start: number; end: number; name: string; attributes: Record<string, string>; inner: string; text: string };

const attributesOf = (source: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1]?.toLowerCase();
    if (name === undefined || name in attributes) continue;
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
};

const tagsOf = (section: string): Tag[] => {
  const tags: Tag[] = [];
  for (const match of section.matchAll(TAGS)) {
    const name = (match[1] ?? match[4])?.toLowerCase();
    if (name === undefined) continue;
    tags.push({ start: match.index, end: match.index + match[0].length, name, attributes: attributesOf(match[2] ?? match[5] ?? ''), inner: match[3] ?? '', text: match[0] });
  }
  return tags;
};

// What a tag in the document says, in the same terms as an element.
const keyOfTag = (tag: Tag): string | undefined =>
  tag.name === 'title' || tag.name === 'meta' || tag.name === 'link' ? headKeyOf({ tag: tag.name, attributes: tag.attributes }) : undefined;

// An element, as the tag it is written as.
const markupOf = (element: HeadElement, marked: boolean): string => {
  const written = Object.entries(element.attributes).map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`));
  const attributes = [...written, ...(marked ? [` ${HEAD_MARK}`] : [])].join('');
  if (element.tag === 'title') return `<title${attributes}>${escapeText(element.text ?? '')}</title>`;
  if (element.tag === 'script') return `<script${attributes}>${escapeScript(element.text ?? '')}</script>`;
  return `<${element.tag}${attributes}>`;
};

// Where the document lives, as elements: what a `site` and a path say.
const addressOf = (place: HeadPlace): HeadElement[] => {
  if (place.site === undefined || place.path === undefined) return [];
  const path = place.path.split(/[?#]/)[0] ?? '';
  const address = `${place.site.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  return [
    { tag: 'link', attributes: { rel: 'canonical', href: address } },
    { tag: 'meta', attributes: { property: 'og:url', content: address } },
  ];
};

const changed = (text: string, changes: readonly { start: number; end: number; text: string }[]): string =>
  [...changes].sort((a, b) => b.start - a.start).reduce((at, change) => `${at.slice(0, change.start)}${change.text}${at.slice(change.end)}`, text);

// A head that was written before, put back as the document had it: what the
// last screen said is taken out, and what the document gave up for it is given
// back. A head never written comes back as it is.
const restored = (section: string): string =>
  changed(
    section,
    tagsOf(section).flatMap((tag) => {
      if (tag.name === 'template' && OWN_MARK in tag.attributes) return [{ start: tag.start, end: tag.end, text: tag.inner }];
      return HEAD_MARK in tag.attributes ? [{ start: tag.start, end: tag.end, text: '' }] : [];
    }),
  );

// Elements, written into a head. `screen`: they are what a screen says — each
// is marked, and a tag that gives up its place is kept for the page. Otherwise
// they are the document's own from here on, and what they replace is gone.
const write = (section: string, elements: readonly HeadElement[], screen: boolean): string => {
  if (elements.length === 0) return section;
  const tags = tagsOf(section);
  const changes: { start: number; end: number; text: string }[] = [];
  const added: string[] = [];
  const own: string[] = [];
  for (const element of elements) {
    const key = headKeyOf(element);
    const [first, ...others] = key === undefined ? [] : tags.filter((tag) => keyOfTag(tag) === key);
    if (first === undefined) {
      added.push(markupOf(element, screen));
      continue;
    }
    changes.push({ start: first.start, end: first.end, text: markupOf(element, screen) });
    own.push(first.text);
    // said twice, the second would still say the old thing
    for (const other of others) {
      changes.push({ start: other.start, end: other.end, text: '' });
      own.push(other.text);
    }
  }
  if (screen && own.length > 0) added.push(`<template ${OWN_MARK}>${own.join('')}</template>`);

  const written = changed(section, changes);
  // What is added goes after the last thing in the head, a line each, indented
  // as that last thing is — or straight on, in a head written on one line.
  const tail = /\s*$/.exec(written)?.[0] ?? '';
  const body = written.slice(0, written.length - tail.length);
  const indent = /(?:^|\n)([ \t]*)\S[^\n]*$/.exec(body)?.[1] ?? '';
  const lead = tail.includes('\n') ? `\n${indent}` : '';
  return `${body}${added.map((tag) => `${lead}${tag}`).join('')}${tail}`;
};

export const placeHead = (html: string, elements: readonly HeadElement[] | undefined, place: HeadPlace = {}): string => {
  const opening = /<head\b[^>]*>/i.exec(html);
  if (opening === null) return html;
  const from = opening.index + opening[0].length;
  const closing = html.slice(from).search(/<\/head\s*>/i);
  if (closing < 0) return html;
  // Where the document lives is the document's own, for this path: written
  // first and unmarked, so a screen that says an address of its own takes its
  // place — and gives it back.
  const located = write(restored(html.slice(from, from + closing)), addressOf(place), false);
  return `${html.slice(0, from)}${write(located, elements ?? [], true)}${html.slice(from + closing)}`;
};

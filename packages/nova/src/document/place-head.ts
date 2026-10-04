import type { Head } from '../layout/head';

// ═══════════════════════════════════════════════════════════
// A screen's head, written into an HTML document.
//
// The document is the app's own `index.html` with a screen already drawn into
// it. What a head says takes the place of the tag that says the same thing —
// the one <title>, the description, the preview tags — and a tag the document
// does not have yet is added before </head>. Everything else in the head is
// left exactly as it was: the icon, the viewport, the stylesheet.
//
// WHERE the document lives is not the screen's to say. Its address is the site
// plus the path it was drawn at, and both are known to whoever writes the
// file: with a `site`, every path is given its own canonical address, whether
// or not its screen has a head.
//
// With no head and no site, the document comes back untouched.
// ═══════════════════════════════════════════════════════════

export type HeadPlace = {
  // The address the site is served at ("https://example.com"). With it, each
  // path's canonical address is written and a preview picture's address is
  // made whole.
  site?: string;
  // The path this document was drawn at.
  path?: string;
};

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Inside a <script>, the one thing that may not appear is the start of a tag.
// The two separators end a line in a script though not in JSON, so they are
// written as escapes too (named by code: the characters themselves would end
// a line here as well).
const LINE_ENDS = [0x2028, 0x2029];
const escapeScript = (value: unknown): string =>
  LINE_ENDS.reduce(
    (text, code) => text.split(String.fromCharCode(code)).join(`\\u${code.toString(16)}`),
    JSON.stringify(value).replace(/</g, '\\u003c'),
  );

// What stands in a head, read a tag at a time: comments and the bodies of
// scripts and styles are passed over whole, so a tag written inside one is not
// mistaken for a tag.
const ATTRIBUTES = `((?:[^>"']|"[^"]*"|'[^']*')*)`;
const ELEMENTS = new RegExp(`<!--[\\s\\S]*?-->|<(script|style|title)\\b${ATTRIBUTES}>([\\s\\S]*?)<\\/\\1\\s*>|<(meta|link)\\b${ATTRIBUTES}>`, 'gi');
const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

type Element = { start: number; end: number; name: string; attributes: Record<string, string>; text: string };

const attributesOf = (written: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  for (const match of written.matchAll(ATTRIBUTE)) {
    const name = match[1]?.toLowerCase();
    if (name === undefined || name in attributes) continue;
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
};

const elementsOf = (section: string): Element[] => {
  const elements: Element[] = [];
  for (const match of section.matchAll(ELEMENTS)) {
    const name = (match[1] ?? match[4])?.toLowerCase();
    if (name === undefined) continue;
    elements.push({ start: match.index, end: match.index + match[0].length, name, attributes: attributesOf(match[2] ?? match[5] ?? ''), text: match[3] ?? '' });
  }
  return elements;
};

const says = (element: Element, attribute: string, value: string): boolean => element.attributes[attribute]?.trim().toLowerCase() === value;

const isAbsolute = (address: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(address) || address.startsWith('//');

const addressOf = (place: HeadPlace): string | undefined => {
  if (place.site === undefined || place.path === undefined) return undefined;
  const path = place.path.split(/[?#]/)[0] ?? '';
  return `${place.site.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
};

// A picture's address as somebody outside the site can fetch it.
const wholeAddress = (address: string, base: string | undefined): string => {
  if (base === undefined || isAbsolute(address)) return address;
  try {
    return new URL(address, base).href;
  } catch {
    return address;
  }
};

// One thing a document says: which tag says it, and the tag as it should stand.
type Saying = { is: (element: Element) => boolean; tag: (was: Element | undefined) => string };

const meta = (attribute: 'name' | 'property', key: string, content: string): Saying => ({
  is: (element) => element.name === 'meta' && says(element, attribute, key),
  tag: () => `<meta ${attribute}="${key}" content="${escapeAttribute(content)}">`,
});

const sayingsOf = (head: Head, place: HeadPlace): Saying[] => {
  const address = addressOf(place);
  const sayings: Saying[] = [];
  if (head.title !== undefined) {
    const title = head.title;
    sayings.push({
      is: (element) => element.name === 'title',
      // The document's own title is kept beside the screen's, so a page that
      // moves on to a screen with no head can say its own again.
      tag: (was) => {
        const own = was === undefined ? undefined : (was.attributes['data-own'] ?? was.text.trim().replace(/"/g, '&quot;'));
        return `<title${own === undefined || own === escapeText(title) ? '' : ` data-own="${own}"`}>${escapeText(title)}</title>`;
      },
    });
  }
  if (head.description !== undefined) sayings.push(meta('name', 'description', head.description));
  if (address !== undefined) {
    sayings.push({
      is: (element) => element.name === 'link' && (element.attributes['rel'] ?? '').toLowerCase().split(/\s+/).includes('canonical'),
      tag: () => `<link rel="canonical" href="${escapeAttribute(address)}">`,
    });
    sayings.push(meta('property', 'og:url', address));
  }
  if (head.kind !== undefined) sayings.push(meta('property', 'og:type', head.kind));
  if (head.title !== undefined) sayings.push(meta('property', 'og:title', head.title));
  if (head.description !== undefined) sayings.push(meta('property', 'og:description', head.description));
  if (head.image !== undefined) sayings.push(meta('property', 'og:image', wholeAddress(head.image, address)));
  return sayings;
};

export const placeHead = (html: string, head: Head | undefined, place: HeadPlace = {}): string => {
  const said = head ?? {};
  const sayings = sayingsOf(said, place);
  if (sayings.length === 0 && said.structured === undefined) return html;

  const opening = /<head\b[^>]*>/i.exec(html);
  if (opening === null) return html;
  const from = opening.index + opening[0].length;
  const closing = html.slice(from).search(/<\/head\s*>/i);
  if (closing < 0) return html;
  const section = html.slice(from, from + closing);
  const elements = elementsOf(section);

  const changes: { start: number; end: number; text: string }[] = [];
  const added: string[] = [];
  for (const saying of sayings) {
    const [first, ...others] = elements.filter(saying.is);
    if (first === undefined) {
      added.push(saying.tag(undefined));
      continue;
    }
    changes.push({ start: first.start, end: first.end, text: saying.tag(first) });
    // said twice, the second would still say the old thing
    for (const other of others) changes.push({ start: other.start, end: other.end, text: '' });
  }
  if (said.structured !== undefined) {
    const script = `<script type="application/ld+json">${escapeScript(said.structured)}</script>`;
    const was = elements.find((element) => element.name === 'script' && says(element, 'type', 'application/ld+json'));
    if (was === undefined) added.push(script);
    else changes.push({ start: was.start, end: was.end, text: script });
  }

  let written = section;
  for (const change of [...changes].sort((a, b) => b.start - a.start)) {
    written = `${written.slice(0, change.start)}${change.text}${written.slice(change.end)}`;
  }
  // What is added goes after the last thing in the head, a line each, indented
  // as that last thing is — or straight on, in a head written on one line.
  const tail = /\s*$/.exec(written)?.[0] ?? '';
  const body = written.slice(0, written.length - tail.length);
  const indent = /(?:^|\n)([ \t]*)\S[^\n]*$/.exec(body)?.[1] ?? '';
  const lead = tail.includes('\n') ? `\n${indent}` : '';
  return `${html.slice(0, from)}${body}${added.map((tag) => `${lead}${tag}`).join('')}${tail}${html.slice(from + closing)}`;
};

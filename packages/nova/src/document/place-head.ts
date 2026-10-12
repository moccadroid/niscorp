import { headKeyOf } from '../layout/head';
import type { HeadElement } from '../layout/head';

export type HeadPlace = {
  // An origin: "https://example.com".
  site?: string;
  path?: string;
};

export const HEAD_MARK = 'data-nova-head';
export const OWN_MARK = 'data-nova-own';

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// U+2028 and U+2029 end a line in a script though not in JSON. They are named
// by code: the characters themselves would end a line in this file as well.
const LINE_ENDS = [0x2028, 0x2029];
const escapeScript = (json: string): string =>
  LINE_ENDS.reduce((text, code) => text.split(String.fromCharCode(code)).join(`\\u${code.toString(16)}`), json.replace(/</g, '\\u003c'));

// Comments and the bodies of scripts, styles and templates are matched whole,
// so a tag written inside one is not taken for a tag.
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

const keyOfTag = (tag: Tag): string | undefined =>
  tag.name === 'title' || tag.name === 'meta' || tag.name === 'link' ? headKeyOf({ tag: tag.name, attributes: tag.attributes }) : undefined;

const markupOf = (element: HeadElement, marked: boolean): string => {
  const written = Object.entries(element.attributes).map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`));
  const attributes = [...written, ...(marked ? [` ${HEAD_MARK}`] : [])].join('');
  if (element.tag === 'title') return `<title${attributes}>${escapeText(element.text ?? '')}</title>`;
  if (element.tag === 'script') return `<script${attributes}>${escapeScript(element.text ?? '')}</script>`;
  return `<${element.tag}${attributes}>`;
};

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

const restored = (section: string): string =>
  changed(
    section,
    tagsOf(section).flatMap((tag) => {
      if (tag.name === 'template' && OWN_MARK in tag.attributes) return [{ start: tag.start, end: tag.end, text: tag.inner }];
      return HEAD_MARK in tag.attributes ? [{ start: tag.start, end: tag.end, text: '' }] : [];
    }),
  );

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
    for (const other of others) {
      changes.push({ start: other.start, end: other.end, text: '' });
      own.push(other.text);
    }
  }
  if (screen && own.length > 0) added.push(`<template ${OWN_MARK}>${own.join('')}</template>`);

  const written = changed(section, changes);
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
  // The address is written first and unmarked, as the document's own: a screen
  // that says an address itself then takes its place, and gives it back.
  const located = write(restored(html.slice(from, from + closing)), addressOf(place), false);
  return `${html.slice(0, from)}${write(located, elements ?? [], true)}${html.slice(from + closing)}`;
};

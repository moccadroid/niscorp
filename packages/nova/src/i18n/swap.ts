import { isArray, isObject } from '../shared/common';
import { matcherFor } from './phrases';
import { isPhrase } from './phrases';
import type { PhraseKeys, Phrasebook } from './phrases';

// ═══════════════════════════════════════════════════════════
// The swap itself — over VALUES, knowing nothing about trees.
//
// Deliberately free of any layout import, because the renderer needs it and
// the renderer is what layout IS. `translate.ts` (the tree walk) and
// `layout/renderer.ts` (the mint) are two callers of this one engine, and the
// whole point of the file is that they can never disagree about what a swap
// means.
// ═══════════════════════════════════════════════════════════

export type Pass = {
  phrases: Phrasebook;
  isProse: (key: string) => boolean;
  text: boolean;
  onMiss: ((phrase: string, where: string) => void) | undefined;
};

export type PassOptions = {
  phrases?: Phrasebook;
  keys?: PhraseKeys;
  onMiss?: (phrase: string, where: string) => void;
};

const EMPTY: Phrasebook = {};

// ACTIVE OR ABSENT, decided once. A host that named neither a book nor a key
// set is not doing i18n, and pays nothing: `undefined` here means the renderer
// skips every branch below, and a `{ phrase, slots }` object passes through as
// the object it is.
//
// A key set WITHOUT a book is the source language, and is NOT nothing: patterns
// still have to be filled, because a counted phrase reaches the glass as a
// structure and nobody downstream knows how to read it. That is the one job
// this pass keeps doing when there is nothing to translate.
export const passFor = (options: PassOptions | undefined): Pass | undefined => {
  if (options === undefined) return undefined;
  if (options.phrases === undefined && options.keys === undefined) return undefined;
  const matcher = matcherFor(options.keys);
  return {
    phrases: options.phrases ?? EMPTY,
    isProse: matcher.isProse,
    text: matcher.text,
    onMiss: options.onMiss,
  };
};

export const swap = (value: string, where: string, pass: Pass): string => {
  if (!isPhrase(value)) return value;
  const hit = pass.phrases[value];
  if (hit !== undefined) return hit;
  // Trailing/leading whitespace is a layout accident, not part of the phrase.
  // Trying the trimmed form keeps `'Save '` from being a second dictionary
  // entry nobody remembers to fill in.
  const trimmed = value.trim();
  if (trimmed !== value) {
    const onTrimmed = pass.phrases[trimmed];
    if (onTrimmed !== undefined) return value.replace(trimmed, onTrimmed);
  }
  pass.onMiss?.(trimmed, where);
  return value;
};

// A PATTERN: a counted phrase, translated WHOLE and filled here — the one
// point that has the book. `{ phrase: '{n} of {total}', slots: { n: 1,
// total: 12 } }` becomes `'1 von 12'`: the pattern is a dictionary row like
// any other, so cardinality stays out of the book. A string slot is offered
// to the book too — a composed sentence's fragments ("somebody enquires")
// are vocabulary in their own right — and everything else interpolates as
// itself. An empty book fills the holes and translates nothing, which is
// exactly what a source-language session needs.
const isPattern = (value: Record<string, unknown>): value is { phrase: string; slots: Record<string, unknown> } =>
  typeof value['phrase'] === 'string' && isObject(value['slots']);

const fillPattern = (pattern: { phrase: string; slots: Record<string, unknown> }, where: string, pass: Pass): string =>
  swap(pattern.phrase, where, pass).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (hole, name: string) => {
    const slot = pattern.slots[name];
    if (slot === undefined || slot === null) return hole;
    return typeof slot === 'string' && isPhrase(slot) ? swap(slot, `${where}.${name}`, pass) : String(slot);
  });

// A book that translates nothing — for filling a pattern outside a render,
// which is the only thing left to do with one when there are no words to swap.
const SOURCE: Pass = { phrases: EMPTY, isProse: () => true, text: true, onMiss: undefined };

// FILL A COUNTED PHRASE THAT NEVER WENT THROUGH A RENDER.
//
// The renderer fills patterns on the way to a screen, so nothing downstream of
// it needs this. What does need it is everything UPSTREAM: a check that reads
// an entry straight from the engine, a fixture, an exporter — anywhere a
// `{ phrase, slots }` is held as data rather than shown as words. Nova defines
// the shape, so nova reads it; a host writing its own copy of this loop is how
// two spellings of one rule start drifting.
//
// Anything that is not a pattern comes back untouched, so it is safe to call
// on a whole column of mixed values.
export const fillPhrase = (value: unknown): unknown => {
  if (!isObject(value) || !isPattern(value)) return value;
  return fillPattern(value, '', SOURCE);
};

// Walk a prop VALUE. Depth matters: a spec prop is where the repeated structure
// of a screen lives (`columns: [{ label }]`, `options: [{ label }]`), so the
// rule cannot be "top-level props only" without missing most of a table.
//
// Returns the value it was given when nothing under it changed. Identity is
// load-bearing rather than tidy: a source-language render must produce the
// props object it produced before this existed, or every untranslated session
// pays a rebuild for a walk that did nothing.
export const walkValue = (value: unknown, prose: boolean, where: string, pass: Pass): unknown => {
  if (typeof value === 'string') return prose ? swap(value, where, pass) : value;
  if (isArray(value)) {
    let changed = false;
    const out = value.map((entry, index) => {
      // An array inherits its key's proseness — `options: ['Yes', 'No']` is as
      // much prose as `options: [{ label: 'Yes' }]`.
      const next = walkValue(entry, prose, `${where}[${String(index)}]`, pass);
      if (next !== entry) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (isObject(value)) {
    if (prose && isPattern(value)) return fillPattern(value, where, pass);
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const next = walkValue(entry, pass.isProse(key), `${where}.${key}`, pass);
      if (next !== entry) changed = true;
      out[key] = next;
    }
    return changed ? out : value;
  }
  return value;
};

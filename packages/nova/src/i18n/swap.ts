import { isArray, isObject } from '../shared/common';
import { matcherFor } from './phrases';
import { isPhrase } from './phrases';
import type { PhraseKeys, Phrasebook } from './phrases';

// No layout import in this file: the renderer imports it.

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

// A key set without a book is the source language, and still a pass: a
// `{ phrase, slots }` pattern has to be filled before it reaches the screen.
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
  const trimmed = value.trim();
  if (trimmed !== value) {
    const onTrimmed = pass.phrases[trimmed];
    if (onTrimmed !== undefined) return value.replace(trimmed, onTrimmed);
  }
  pass.onMiss?.(trimmed, where);
  return value;
};

const isPattern = (value: Record<string, unknown>): value is { phrase: string; slots: Record<string, unknown> } =>
  typeof value['phrase'] === 'string' && isObject(value['slots']);

const fillPattern = (pattern: { phrase: string; slots: Record<string, unknown> }, where: string, pass: Pass): string =>
  swap(pattern.phrase, where, pass).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (hole, name: string) => {
    const slot = pattern.slots[name];
    if (slot === undefined || slot === null) return hole;
    return typeof slot === 'string' && isPhrase(slot) ? swap(slot, `${where}.${name}`, pass) : String(slot);
  });

const SOURCE: Pass = { phrases: EMPTY, isProse: () => true, text: true, onMiss: undefined };

export const fillPhrase = (value: unknown): unknown => {
  if (!isObject(value) || !isPattern(value)) return value;
  return fillPattern(value, '', SOURCE);
};

export const walkValue = (value: unknown, prose: boolean, where: string, pass: Pass): unknown => {
  if (typeof value === 'string') return prose ? swap(value, where, pass) : value;
  if (isArray(value)) {
    let changed = false;
    const out = value.map((entry, index) => {
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

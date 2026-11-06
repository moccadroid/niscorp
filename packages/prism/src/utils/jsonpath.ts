import type { JsonValue } from '../types';
import { isJsonArray, isJsonObject } from '../schemas/guards';
import { PrismError, ErrorCode, describeValue } from '../errors';

export type JsonPathSegment =
  | { type: 'key'; key: string }
  | { type: 'index'; index: number };

export const pathRefusal = (path: string): string =>
  `Not a path Prism reads: "${path}". A path is keys and indexes only, as in $.rows[0].sku; for every item of a list use $map or $pluck.`;

const refuse = (path: string): never => {
  throw new PrismError(pathRefusal(path), ErrorCode.SCHEMA, { op: '$ref', path });
};

export const isReadablePath = (path: string): boolean => {
  if (!path.includes('[') && !path.includes('..')) return true;
  try {
    parseJsonPath(path);
    return true;
  } catch {
    return false;
  }
};

export const parseJsonPath = (path: string): JsonPathSegment[] => {
  if (!path.startsWith('$.')) return [];

  const segments: JsonPathSegment[] = [];
  let cursor = 2;
  let currentKey = '';

  const pushKey = (): void => {
    if (currentKey.length > 0) {
      segments.push({ type: 'key', key: currentKey });
      currentKey = '';
    }
  };

  while (cursor < path.length) {
    const char = path[cursor]!;

    if (char === '.') {
      if (path[cursor - 1] === '.') refuse(path);
      pushKey();
      cursor++;
      continue;
    }

    if (char === '[') {
      pushKey();
      cursor++;
      let numBuf = '';
      while (cursor < path.length && path[cursor] !== ']') {
        numBuf += path[cursor];
        cursor++;
      }
      if (path[cursor] !== ']') refuse(path);
      cursor++;
      const index = Number(numBuf);
      if (numBuf.trim() === '' || !Number.isInteger(index) || index < 0) refuse(path);
      segments.push({ type: 'index', index });
      continue;
    }

    currentKey += char;
    cursor++;
  }

  pushKey();
  return segments;
};

const cache = new Map<string, JsonPathSegment[]>();

export const parseJsonPathCached = (path: string): JsonPathSegment[] => {
  const cached = cache.get(path);
  if (cached) return cached;
  const parsed = parseJsonPath(path);
  cache.set(path, parsed);
  return parsed;
};

export type Step = string | number;

export const INDEX_TEXT = /^(0|[1-9][0-9]*)$/;

const MAX_KEYS = 10;

export const whereStopped = (root: JsonValue, steps: readonly Step[], nameUpTo: (count: number) => string, digitsIndex = false): string => {
  let at: JsonValue | undefined = root;
  for (const [i, raw] of steps.entries()) {
    const here = nameUpTo(i);
    const shown = JSON.stringify(raw);
    const step: Step = digitsIndex && typeof raw === 'string' && isJsonArray(at) && INDEX_TEXT.test(raw) ? Number(raw) : raw;
    if (typeof step === 'number') {
      if (!isJsonArray(at)) return `stopped at ${shown}: the value at ${here} is ${describeValue(at)}, and only a list is read by index.`;
      if (at[step] === undefined) return `stopped at ${shown}: the list at ${here} has ${at.length} item${at.length === 1 ? '' : 's'}.`;
      at = at[step];
    } else {
      if (isJsonArray(at)) return `stopped at ${shown}: the value at ${here} is ${describeValue(at)}, and a list is read by index, a number; for every item use $map.`;
      if (!isJsonObject(at)) return `stopped at ${shown}: the value at ${here} is ${describeValue(at)}, which has no keys.`;
      if (at[step] === undefined) {
        const keys = Object.keys(at);
        const listed = keys.slice(0, MAX_KEYS).join(', ') + (keys.length > MAX_KEYS ? ', …' : '');
        return `stopped at ${shown}: the object at ${here} has no key ${shown} (${keys.length === 0 ? 'it has no keys' : `its keys: ${listed}`}).`;
      }
      at = at[step];
    }
  }
  return '';
};

export const jsonPathUpTo = (segments: readonly JsonPathSegment[], count: number): string =>
  segments.slice(0, count).reduce((text, s) => (s.type === 'key' ? `${text}.${s.key}` : `${text}[${s.index}]`), '$');

export const getByPath = (root: JsonValue, segments: JsonPathSegment[]): JsonValue | undefined => {
  let current: JsonValue | undefined = root;

  for (const segment of segments) {
    if (segment.type === 'key') {
      if (!isJsonObject(current)) return undefined;
      current = current[segment.key];
    } else {
      if (!isJsonArray(current)) return undefined;
      current = current[segment.index];
    }
  }

  return current;
};

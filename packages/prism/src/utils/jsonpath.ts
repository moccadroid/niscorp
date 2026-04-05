import type { JsonValue } from '../types';
import { isJsonArray, isJsonObject } from '../schemas/guards';

// ═══════════════════════════════════════════════════════════
// Path Segment Types
// ═══════════════════════════════════════════════════════════

export type JsonPathSegment =
  | { type: 'key'; key: string }
  | { type: 'index'; index: number };

// ═══════════════════════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════════════════════

export const parseJsonPath = (path: string): JsonPathSegment[] => {
  if (!path.startsWith('$.')) return [];

  const segments: JsonPathSegment[] = [];
  let cursor = 2; // skip "$."
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
      if (path[cursor] !== ']') return [];
      cursor++; // skip ']'
      const index = Number(numBuf);
      if (!Number.isInteger(index) || index < 0) return [];
      segments.push({ type: 'index', index });
      continue;
    }

    currentKey += char;
    cursor++;
  }

  pushKey();
  return segments;
};

// ═══════════════════════════════════════════════════════════
// Cache
// ═══════════════════════════════════════════════════════════

const cache = new Map<string, JsonPathSegment[]>();

export const parseJsonPathCached = (path: string): JsonPathSegment[] => {
  const cached = cache.get(path);
  if (cached) return cached;
  const parsed = parseJsonPath(path);
  cache.set(path, parsed);
  return parsed;
};

export const primeJsonPathCache = (paths: string[]): void => {
  for (const p of paths) {
    if (!cache.has(p)) cache.set(p, parseJsonPath(p));
  }
};

// ═══════════════════════════════════════════════════════════
// Path Resolution
// ═══════════════════════════════════════════════════════════

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

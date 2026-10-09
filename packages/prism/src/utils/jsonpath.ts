import type { JsonValue } from '../types';
import { isJsonArray, isJsonObject } from '../schemas/guards';
import { PrismError, ErrorCode } from '../errors';

// ═══════════════════════════════════════════════════════════
// Path Segment Types
// ═══════════════════════════════════════════════════════════

export type JsonPathSegment =
  | { type: 'key'; key: string }
  | { type: 'index'; index: number };

// ═══════════════════════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════════════════════

// A path is keys and indexes: `$.rows[0].sku`. Anything else JSONPath has — a
// wildcard `[*]`, a filter `[?(…)]`, a slice, a quoted key, `..` — is refused.
// The parser used to give up on those with no segments at all, which reads as
// `$`: `$.rows[*].sku` answered the whole source.
export const pathRefusal = (path: string): string =>
  `Not a path Prism reads: "${path}". A path is keys and indexes only, as in $.rows[0].sku; for every item of a list use $map or $pluck.`;

const refuse = (path: string): never => {
  throw new PrismError(pathRefusal(path), ErrorCode.SCHEMA, { op: '$ref', path });
};

export const isReadablePath = (path: string): boolean => {
  // Keys alone are always read; only a bracket or `..` can be refused.
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
      cursor++; // skip ']'
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

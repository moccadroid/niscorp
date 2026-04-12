import type { ParserEvent } from './types';
import type { ValueKind } from './schema-walker';

// ═══════════════════════════════════════════════════════════
// Incremental JSON parser with structural sharing
//
// write(chunk) — processes new characters only, O(chunk).
//   Mutates an internal root object. Returns parser events.
//
// snapshot(previous) — produces an immutable snapshot with
//   structural sharing from `previous`. Only objects along
//   dirty paths get new references; everything else is shared.
//   O(dirty_paths × depth), not O(object_size).
//
// Together these eliminate both JSON.parse and structuredClone
// from the hot path.
//
// valueOpenHook — fired the moment a value's kind is known
// (object/array/string/number/boolean/null) at a known path.
// Returning 'skip' transitions the parser into skip-mode for
// that subtree: the value is not written, no events are emitted
// for it, and parsing resumes after the structural close. Used
// by the validator to enforce the kind-check invariant.
// ═══════════════════════════════════════════════════════════

export type ValueOpenDecision = 'accept' | 'skip';

export type ValueOpenHook = (path: string, kind: ValueKind) => ValueOpenDecision;

export type IncrementalParserOptions = {
  valueOpenHook?: ValueOpenHook;
};

export type IncrementalParser = {
  write: (chunk: string) => ParserEvent[];
  snapshot: <T>(previous: T) => SnapshotResult<T>;
};

export type SnapshotResult<T> =
  | { changed: true; value: T }
  | { changed: false };

export const createIncrementalParser = (
  base: unknown,
  opts: IncrementalParserOptions = {},
): IncrementalParser => {
  const valueOpenHook = opts.valueOpenHook;
  const root = structuredClone(base);

  // ─── Navigation ───
  const containerStack: unknown[] = [];
  const containerTypeStack: ('object' | 'array')[] = [];
  const arrayIndexStack: number[] = [];
  let currentKey = '';

  // ─── Path tracking (for events + dirty marking) ───
  const pathStack: string[] = [];
  let hasUnpoppedValue = false;

  // ─── Dirty tracking ───
  // Maps parent path → set of dirty child keys.
  // e.g. modifying widget.type records: '' → {'widget'}, 'widget' → {'type'}
  const dirtyParents = new Map<string, Set<string>>();
  let isDirty = false;

  // ─── Scanner state ───
  let afterColon = false;
  let expectingValue = false;

  // ─── Value accumulation ───
  let collectingKey = false;
  let accumulatingString = false;
  let accumulatingLiteral = false;
  let valueBuffer = '';
  let stringEscapeNext = false;
  let unicodeDigits = '';
  let inUnicodeEscape = false;

  // ─── Skip-mode state ───
  // Triggered when valueOpenHook returns 'skip' for a value-open. The parser
  // consumes characters without writing values, emitting events, or marking
  // anything dirty. The path remains on the stack with hasUnpoppedValue=true,
  // so the next ',' or '}' / ']' pops it normally.
  let skipping = false;
  let skipKind: 'string' | 'object' | 'array' | 'literal' = 'string';
  let skipDepth = 0;
  let skipInString = false;
  let skipStringEscape = false;

  // ─── Helpers ───

  const currentPath = (): string => pathStack.join('.');

  const topContainerType = (): 'object' | 'array' | undefined =>
    containerTypeStack[containerTypeStack.length - 1];

  const topArrayIndex = (): number =>
    arrayIndexStack[arrayIndexStack.length - 1] ?? 0;

  const topContainer = (): Record<string, unknown> | unknown[] =>
    containerStack[containerStack.length - 1] as Record<string, unknown> | unknown[];

  const markDirty = (): void => {
    isDirty = true;
    for (let i = 0; i < pathStack.length; i++) {
      const parentPath = i === 0 ? '' : pathStack.slice(0, i).join('.');
      const key = pathStack[i];
      if (!key) continue;
      let keys = dirtyParents.get(parentPath);
      if (!keys) {
        keys = new Set();
        dirtyParents.set(parentPath, keys);
      }
      keys.add(key);
    }
  };

  const setValue = (value: unknown): void => {
    const container = topContainer();
    let existing: unknown;
    if (topContainerType() === 'object') {
      const obj = container as Record<string, unknown>;
      existing = obj[currentKey];
      obj[currentKey] = value;
    } else {
      const arr = container as unknown[];
      const idx = topArrayIndex();
      existing = arr[idx];
      arr[idx] = value;
    }
    // Only mark dirty if the value actually changed.
    // For primitives, === catches identity. For containers (objects/arrays
    // created by enterContainer), the reference is always new so this
    // always marks dirty — which is correct.
    if (value !== existing) {
      markDirty();
    }
  };

  const enterContainer = (type: 'object' | 'array'): void => {
    if (containerStack.length === 0) {
      containerStack.push(root);
      containerTypeStack.push(type);
      return;
    }

    const container = topContainer();
    let existing: unknown;
    if (topContainerType() === 'object') {
      existing = (container as Record<string, unknown>)[currentKey];
    } else {
      existing = (container as unknown[])[topArrayIndex()];
    }

    if (type === 'object') {
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        containerStack.push(existing);
      } else {
        const obj: Record<string, unknown> = {};
        setValue(obj);
        containerStack.push(obj);
      }
    } else {
      if (Array.isArray(existing)) {
        containerStack.push(existing);
      } else {
        const arr: unknown[] = [];
        setValue(arr);
        containerStack.push(arr);
      }
    }
    containerTypeStack.push(type);
  };

  // ─── Skip-mode helper ───
  // Returns true if the hook accepted the value (continue normally),
  // false if the parser is now in skip-mode (caller should `continue`).
  const checkValueOpen = (path: string, kind: ValueKind): boolean => {
    if (!valueOpenHook) return true;
    const decision = valueOpenHook(path, kind);
    if (decision === 'accept') return true;
    return false;
  };

  const enterSkipString = (): void => {
    skipping = true;
    skipKind = 'string';
    skipStringEscape = false;
  };
  const enterSkipObject = (): void => {
    skipping = true;
    skipKind = 'object';
    skipDepth = 1;
    skipInString = false;
    skipStringEscape = false;
  };
  const enterSkipArray = (): void => {
    skipping = true;
    skipKind = 'array';
    skipDepth = 1;
    skipInString = false;
    skipStringEscape = false;
  };
  const enterSkipLiteral = (): void => {
    skipping = true;
    skipKind = 'literal';
  };

  // ─── Write ───

  const write = (chunk: string): ParserEvent[] => {
    const events: ParserEvent[] = [];

    for (const ch of chunk) {
      // ── Skip mode ──
      if (skipping) {
        switch (skipKind) {
          case 'string': {
            if (skipStringEscape) {
              skipStringEscape = false;
              continue;
            }
            if (ch === '\\') {
              skipStringEscape = true;
              continue;
            }
            if (ch === '"') {
              skipping = false;
            }
            continue;
          }
          case 'object':
          case 'array': {
            if (skipInString) {
              if (skipStringEscape) {
                skipStringEscape = false;
                continue;
              }
              if (ch === '\\') {
                skipStringEscape = true;
                continue;
              }
              if (ch === '"') {
                skipInString = false;
              }
              continue;
            }
            if (ch === '"') {
              skipInString = true;
              continue;
            }
            const opener = skipKind === 'object' ? '{' : '[';
            const closer = skipKind === 'object' ? '}' : ']';
            if (ch === opener) {
              skipDepth++;
              continue;
            }
            if (ch === closer) {
              skipDepth--;
              if (skipDepth === 0) {
                skipping = false;
              }
              continue;
            }
            continue;
          }
          case 'literal': {
            if (isLiteralChar(ch)) continue;
            // Delimiter — exit skip and let outer switch process it.
            skipping = false;
            // Fall through to normal handling.
            break;
          }
        }
        if (skipping) continue;
      }

      // ── String accumulation ──
      if (accumulatingString) {
        if (inUnicodeEscape) {
          unicodeDigits += ch;
          if (unicodeDigits.length === 4) {
            valueBuffer += String.fromCharCode(parseInt(unicodeDigits, 16));
            inUnicodeEscape = false;
          }
          continue;
        }

        if (stringEscapeNext) {
          if (ch === 'u') {
            inUnicodeEscape = true;
            unicodeDigits = '';
          } else {
            valueBuffer += unescapeChar(ch);
          }
          stringEscapeNext = false;
          continue;
        }

        if (ch === '\\') {
          stringEscapeNext = true;
          continue;
        }

        if (ch === '"') {
          accumulatingString = false;
          if (collectingKey) {
            collectingKey = false;
            currentKey = valueBuffer;
          } else {
            setValue(valueBuffer);
          }
          valueBuffer = '';
          continue;
        }

        valueBuffer += ch;
        if (!collectingKey) {
          setValue(valueBuffer);
        }
        continue;
      }

      // ── Literal accumulation ──
      if (accumulatingLiteral) {
        if (isLiteralChar(ch)) {
          valueBuffer += ch;
          continue;
        }
        const parsed = parseLiteral(valueBuffer);
        if (parsed.ok) {
          setValue(parsed.value);
        }
        valueBuffer = '';
        accumulatingLiteral = false;
        // Fall through — ch is a delimiter
      }

      // ── Structural tokens ──
      switch (ch) {
        case '{': {
          const isRoot = containerStack.length === 0;
          if (topContainerType() === 'array' && expectingValue) {
            const idx = topArrayIndex();
            events.push({ type: 'enterIndex', path: currentPath(), index: idx });
            pathStack.push(String(idx));
            hasUnpoppedValue = true;
          }
          const path = currentPath();
          if (!isRoot && !checkValueOpen(path, 'object')) {
            enterSkipObject();
            afterColon = false;
            expectingValue = false;
            break;
          }
          enterContainer('object');
          events.push({ type: 'enterObject', path });
          afterColon = false;
          expectingValue = false;
          hasUnpoppedValue = false;
          break;
        }

        case '}': {
          if (hasUnpoppedValue) {
            events.push({ type: 'valueComplete', path: currentPath() });
            pathStack.pop();
            hasUnpoppedValue = false;
          }
          const closePath = currentPath();
          events.push({ type: 'leaveObject', path: closePath });
          containerStack.pop();
          containerTypeStack.pop();
          if (pathStack.length > 0) pathStack.pop();
          afterColon = false;
          expectingValue = false;
          hasUnpoppedValue = false;
          break;
        }

        case '[': {
          const isRootArr = containerStack.length === 0;
          if (topContainerType() === 'array' && expectingValue) {
            const idx = topArrayIndex();
            events.push({ type: 'enterIndex', path: currentPath(), index: idx });
            pathStack.push(String(idx));
            hasUnpoppedValue = true;
          }
          const arrPath = currentPath();
          if (!isRootArr && !checkValueOpen(arrPath, 'array')) {
            enterSkipArray();
            afterColon = false;
            expectingValue = false;
            break;
          }
          enterContainer('array');
          events.push({ type: 'enterArray', path: arrPath });
          arrayIndexStack.push(0);
          expectingValue = true;
          afterColon = false;
          hasUnpoppedValue = false;
          break;
        }

        case ']': {
          if (hasUnpoppedValue) {
            events.push({ type: 'valueComplete', path: currentPath() });
            pathStack.pop();
            hasUnpoppedValue = false;
          }
          const arrClosePath = currentPath();
          events.push({ type: 'leaveArray', path: arrClosePath });
          containerStack.pop();
          containerTypeStack.pop();
          arrayIndexStack.pop();
          if (pathStack.length > 0) pathStack.pop();
          expectingValue = false;
          afterColon = false;
          hasUnpoppedValue = false;
          break;
        }

        case '"': {
          if (topContainerType() === 'object' && !afterColon) {
            // Key, not a value — never validated by hook
            accumulatingString = true;
            valueBuffer = '';
            collectingKey = true;
            break;
          }
          if (topContainerType() === 'array' && expectingValue) {
            const idx = topArrayIndex();
            events.push({ type: 'enterIndex', path: currentPath(), index: idx });
            pathStack.push(String(idx));
            expectingValue = false;
            hasUnpoppedValue = true;
          }
          if (!checkValueOpen(currentPath(), 'string')) {
            enterSkipString();
            // Match accept-side state changes that happen on string close.
            // hasUnpoppedValue stays true; ',' or '}' will pop.
            break;
          }
          accumulatingString = true;
          valueBuffer = '';
          collectingKey = false;
          break;
        }

        case ':': {
          if (topContainerType() === 'object') {
            afterColon = true;
            events.push({ type: 'enterKey', path: currentPath(), key: currentKey });
            pathStack.push(currentKey);
            expectingValue = true;
            hasUnpoppedValue = true;
          }
          break;
        }

        case ',': {
          if (hasUnpoppedValue) {
            events.push({ type: 'valueComplete', path: currentPath() });
            pathStack.pop();
            hasUnpoppedValue = false;
          }
          if (topContainerType() === 'object') {
            afterColon = false;
            expectingValue = false;
          } else if (topContainerType() === 'array') {
            const lastIdx = arrayIndexStack.length - 1;
            if (lastIdx >= 0) {
              arrayIndexStack[lastIdx] = (arrayIndexStack[lastIdx] ?? 0) + 1;
            }
            expectingValue = true;
          }
          break;
        }

        default: {
          if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') break;
          if (!expectingValue) break;

          if (topContainerType() === 'array') {
            const idx = topArrayIndex();
            events.push({ type: 'enterIndex', path: currentPath(), index: idx });
            pathStack.push(String(idx));
            hasUnpoppedValue = true;
          }
          const litKind = literalKindFromChar(ch);
          if (!checkValueOpen(currentPath(), litKind)) {
            enterSkipLiteral();
            expectingValue = false;
            break;
          }
          accumulatingLiteral = true;
          valueBuffer = ch;
          expectingValue = false;
          break;
        }
      }
    }

    // Flush partial literal at end of chunk
    if (accumulatingLiteral && valueBuffer.length > 0) {
      const parsed = parseLiteral(valueBuffer);
      if (parsed.ok) {
        setValue(parsed.value);
      }
    }

    return events;
  };

  // ─── Snapshot with structural sharing ───

  const snapshot = <T>(previous: T): SnapshotResult<T> => {
    if (!isDirty) return { changed: false };

    const value = shareStructure(root, previous, '') as T;
    dirtyParents.clear();
    isDirty = false;
    return { changed: true, value };
  };

  const shareStructure = (source: unknown, previous: unknown, path: string): unknown => {
    const dirtyKeys = dirtyParents.get(path);

    // No dirty children at this path — reuse previous reference entirely
    if (!dirtyKeys) return previous;

    if (Array.isArray(source)) {
      const prevArr = Array.isArray(previous) ? previous : [];
      const result: unknown[] = new Array(source.length);
      for (let i = 0; i < source.length; i++) {
        const key = String(i);
        if (dirtyKeys.has(key)) {
          const childPath = path === '' ? key : `${path}.${key}`;
          result[i] = dirtyParents.has(childPath)
            ? shareStructure(source[i], prevArr[i], childPath)
            : source[i];
        } else {
          result[i] = i < prevArr.length ? prevArr[i] : source[i];
        }
      }
      return result;
    }

    if (typeof source === 'object' && source !== null) {
      const sObj = source as Record<string, unknown>;
      const pObj = typeof previous === 'object' && previous !== null && !Array.isArray(previous)
        ? previous as Record<string, unknown>
        : {};
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(sObj)) {
        if (dirtyKeys.has(key)) {
          const childPath = path === '' ? key : `${path}.${key}`;
          result[key] = dirtyParents.has(childPath)
            ? shareStructure(sObj[key], pObj[key], childPath)
            : sObj[key];
        } else {
          result[key] = key in pObj ? pObj[key] : sObj[key];
        }
      }
      return result;
    }

    return source;
  };

  return { write, snapshot };
};

// ───────────────────────────────────────────────────────────
// String unescape
// ───────────────────────────────────────────────────────────

const unescapeChar = (ch: string): string => {
  switch (ch) {
    case '"': return '"';
    case '\\': return '\\';
    case '/': return '/';
    case 'b': return '\b';
    case 'f': return '\f';
    case 'n': return '\n';
    case 'r': return '\r';
    case 't': return '\t';
    default: return ch;
  }
};

// ───────────────────────────────────────────────────────────
// Literal parsing
// ───────────────────────────────────────────────────────────

const isLiteralChar = (ch: string): boolean =>
  (ch >= '0' && ch <= '9') || ch === '.' || ch === '-' || ch === '+' ||
  ch === 'e' || ch === 'E' ||
  (ch >= 'a' && ch <= 'z');

type LiteralResult = { ok: true; value: unknown } | { ok: false };

const parseLiteral = (buf: string): LiteralResult => {
  if (buf === 'true') return { ok: true, value: true };
  if (buf === 'false') return { ok: true, value: false };
  if (buf === 'null') return { ok: true, value: null };
  const num = Number(buf);
  if (!Number.isNaN(num)) return { ok: true, value: num };
  return { ok: false };
};

// First-char heuristic to determine literal value kind for value-open hook.
const literalKindFromChar = (ch: string): ValueKind => {
  if (ch === 't' || ch === 'f') return 'boolean';
  if (ch === 'n') return 'null';
  return 'number';
};

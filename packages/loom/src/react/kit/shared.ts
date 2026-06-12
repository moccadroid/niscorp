import type { CSSProperties } from 'react';
import { isRecord } from '@compile/parse';
import type { Pattern } from '@compile/types';

// Shared by the kit's controls and structural editors.

export const inputStyle: CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' };

// The value's own JS type, in the vocabulary the compiler's patterns use.
export const jsType = (value: unknown): string =>
  Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

// Decode a JSON-encoded literal prop (see `literal` in to-nova). The compiler
// passes static `$`-bearing metadata (a variant's branches, a list's containers,
// an "add" default) as a JSON string so Nova's resolver leaves it intact; the
// component parses it back. Tolerates an already-decoded value or absence.
export const decodeLiteral = <T>(value: unknown): T | undefined =>
  typeof value === 'string' ? (JSON.parse(value) as T) : (value as T | undefined);

// Does a value belong to a branch? `===` for a tag, `in` for a key, `typeof`
// for a type — the whole of union discrimination, in plain JS. A `fallback`
// branch never matches positively; the widget selects it only when nothing else
// does, so it answers false here.
export const matches = (value: unknown, pattern: Pattern): boolean => {
  if (pattern.kind === 'tag') return isRecord(value) && value[pattern.key] === pattern.value;
  if (pattern.kind === 'key') return isRecord(value) && pattern.key in value;
  if (pattern.kind === 'type') return jsType(value) === pattern.type;
  return false;
};

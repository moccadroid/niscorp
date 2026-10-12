import type { CSSProperties } from 'react';
import { isRecord } from '@compile/parse';
import type { Pattern } from '@compile/types';

export const inputStyle: CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' };

export const jsType = (value: unknown): string =>
  Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

export const decodeLiteral = <T>(value: unknown): T | undefined =>
  typeof value === 'string' ? (JSON.parse(value) as T) : (value as T | undefined);

export const matches = (value: unknown, pattern: Pattern): boolean => {
  if (pattern.kind === 'tag') return isRecord(value) && value[pattern.key] === pattern.value;
  if (pattern.kind === 'key') return isRecord(value) && pattern.key in value;
  if (pattern.kind === 'type') return jsType(value) === pattern.type;
  return false;
};

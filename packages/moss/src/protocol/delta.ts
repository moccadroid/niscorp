import type { DeltaOp } from './messages';

// The shortest run worth a copy, in characters.
const BLOCK = 16;

export const encodeDelta = (base: string, target: string): DeltaOp[] => {
  if (base.length < BLOCK) return [[1, target]];

  const index = new Map<string, number>();
  for (let i = 0; i + BLOCK <= base.length; i += 1) {
    const key = base.slice(i, i + BLOCK);
    if (!index.has(key)) index.set(key, i);
  }

  const ops: DeltaOp[] = [];
  let literal = '';
  let at = 0;

  while (at < target.length) {
    const key = target.slice(at, at + BLOCK);
    const found = key.length === BLOCK ? index.get(key) : undefined;
    if (found === undefined) {
      literal += target[at];
      at += 1;
      continue;
    }
    let length = BLOCK;
    while (found + length < base.length && at + length < target.length && base[found + length] === target[at + length]) {
      length += 1;
    }
    if (literal !== '') {
      ops.push([1, literal]);
      literal = '';
    }
    ops.push([0, found, length]);
    at += length;
  }
  if (literal !== '') ops.push([1, literal]);
  return ops;
};

export const applyDelta = (base: string, ops: readonly DeltaOp[]): string => {
  let out = '';
  for (const op of ops) {
    if (op[0] === 1) {
      out += op[1];
      continue;
    }
    const [, offset, length] = op;
    if (offset < 0 || length < 0 || offset + length > base.length) {
      throw new Error(`moss/delta: copy ${offset}+${length} is outside a base of ${base.length}`);
    }
    out += base.slice(offset, offset + length);
  }
  return out;
};

export const frameHash = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

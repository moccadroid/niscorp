// Frame deltas — send what changed, not the frame.
//
// A shell re-sends a whole canvas tree whenever that tree changes. Most changes
// are small against a large tree (a keystroke filters a list, one badge flips),
// so the new frame is mostly a rearrangement of bytes the client already holds.
//
// This encodes the new frame as COPY runs from the old one plus literal
// inserts. It is deliberately not a structural diff over the tree: a
// navigation produces a genuinely different tree, and a path-based diff then
// costs MORE than the frame it replaces, while a byte matcher still finds the
// shared vocabulary. It is also not zlib's preset dictionary, which would be
// two lines here and does not exist in a browser.
//
// No dependency, both directions in one file, and small enough to read in
// full — a delta layer that cannot be audited is a desync you cannot diagnose.

/** A run copied from the base frame: offset, length. */
type Copy = [0, number, number];
/** Bytes that are not in the base at all. */
type Insert = [1, string];
export type DeltaOp = Copy | Insert;

// Matches shorter than this cost more to describe than to inline. 16 is a
// compromise: low enough to catch a changed cell inside a row, high enough that
// the index does not match noise.
const BLOCK = 16;

/**
 * Encode `target` as operations against `base`.
 *
 * Greedy and single-pass: at each position look for a block that already exists
 * in the base, extend the match as far as it runs, and emit a copy. Anything
 * unmatched accumulates into a literal. Not optimal — an optimal encoder needs
 * a suffix automaton — but it captures the long shared runs that dominate a
 * render tree, which is where the bytes are.
 */
export const encodeDelta = (base: string, target: string): DeltaOp[] => {
  if (base.length < BLOCK) return [[1, target]];

  const index = new Map<string, number>();
  for (let i = 0; i + BLOCK <= base.length; i += 1) {
    // First position wins: earlier offsets tend to extend further in a tree
    // whose head is stable chrome.
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

/** Rebuild the frame. Throws on a malformed op rather than returning a
 *  half-applied string — a silently wrong frame is the failure this whole
 *  layer has to not have. */
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

/**
 * A cheap, order-sensitive checksum of a frame.
 *
 * Carried on every delta so a client can prove it rebuilt the frame the server
 * meant. A delta protocol without this is one dropped message away from a
 * client that is permanently and silently wrong, with no error anywhere — which
 * is strictly worse than sending whole frames forever.
 */
export const frameHash = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

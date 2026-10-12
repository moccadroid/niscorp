import { describe, it, expect } from 'vitest';
import { OP_KEYS, evaluate, validate } from '../src';
import type { OpKey } from '../src';
import { PRISM_EXAMPLES, PRISM_EXAMPLE_GROUPS } from '../src/examples';

const isOpKey = (key: string): key is OpKey => OP_KEYS.some((op) => op === key);

const opsUsedIn = (node: unknown, found: Set<OpKey> = new Set()): Set<OpKey> => {
  if (Array.isArray(node)) {
    node.forEach((item) => opsUsedIn(item, found));
    return found;
  }
  if (typeof node !== 'object' || node === null) return found;
  for (const [key, value] of Object.entries(node)) {
    if (isOpKey(key)) found.add(key);
    if (key !== '$const') opsUsedIn(value, found);
  }
  return found;
};

const idOf = (op: OpKey): string =>
  op.slice(1).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

describe('the examples', () => {
  it('each has an id of its own, in kebab-case', () => {
    const ids = PRISM_EXAMPLES.map((example) => example.id);
    expect(ids.filter((id, at) => ids.indexOf(id) !== at)).toEqual([]);
    expect(ids.filter((id) => !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id))).toEqual([]);
  });

  it('each says what it is', () => {
    const silent = PRISM_EXAMPLES.filter(
      (example) => example.title.trim() === '' || example.description.trim().length < 10,
    );
    expect(silent.map((example) => example.id)).toEqual([]);
  });

  it('each is in a group that is named, and every named group has some', () => {
    const named = PRISM_EXAMPLE_GROUPS.map((group) => group.id);
    expect(named.filter((id, at) => named.indexOf(id) !== at)).toEqual([]);
    expect(
      PRISM_EXAMPLES.filter((example) => !named.includes(example.group)).map(
        (example) => example.id,
      ),
    ).toEqual([]);
    expect(named.filter((id) => !PRISM_EXAMPLES.some((example) => example.group === id))).toEqual(
      [],
    );
  });

  it.each(PRISM_EXAMPLES.map((example) => [example.id, example] as const))(
    '%s is a valid config and answers what it says',
    (_id, example) => {
      expect(validate(example.config).ok).toBe(true);
      expect(evaluate(example.config, example.source)).toEqual(example.expected);
    },
  );

  it("an operator's example carries the operator's name, and uses it", () => {
    const off = PRISM_EXAMPLES.filter(
      (example) =>
        example.op !== undefined &&
        (example.title !== example.op ||
          example.id !== idOf(example.op) ||
          !opsUsedIn(example.config).has(example.op)),
    );
    expect(off.map((example) => example.id)).toEqual([]);
  });

  it('every operator has exactly one', () => {
    const shown = PRISM_EXAMPLES.flatMap((example) =>
      example.op === undefined ? [] : [example.op],
    );
    expect(OP_KEYS.filter((op) => !shown.includes(op))).toEqual([]);
    expect(shown.filter((op, at) => shown.indexOf(op) !== at)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { z, type ZodType } from 'zod';
import { createComponentRegistry } from '@niscorp/nova';
import { createLoomEditor } from '../src/index.js';
import { prismPlugin } from '../src/plugins/prism/index.js';

// The controller alone: it compiles each document's form and seeds it. Nothing
// is drawn here, so the registry only has to say it has every component.
const anyKit = (): ReturnType<typeof createComponentRegistry> => ({ ...createComponentRegistry(), has: () => true });

// What the editor holds for one document of `schema`, straight after `open`.
const opened = (schema: ZodType, seed?: unknown): unknown => {
  const editor = createLoomEditor({ registry: anyKit() });
  editor.loadPlugin({ name: 'test', documents: { doc: schema } });
  editor.open({ type: 'test', ...(seed === undefined ? {} : { documents: { doc: seed } }) });
  const held = editor.documents['doc'];
  editor.dispose();
  return held;
};

const TUPLE = z.tuple([z.string(), z.number()]);
const TEXT_OR_OBJECT = z.union([z.string(), z.object({ from: z.string() })]);

// A document whose root is not an object is wrapped under a key of the editor's
// own (it needs a path to bind to). Its seed is the bare value.
const ACCEPTED: ReadonlyArray<readonly [string, ZodType, unknown]> = [
  ['a list', z.array(z.string()), ['stalls', 'circle']],
  ['a list of objects', z.array(z.object({ seat: z.string() })), [{ seat: 'C4' }, { seat: 'C5' }]],
  ['a string', z.string(), 'The Tempest'],
  ['a number', z.number(), 42],
  ['a boolean', z.boolean(), true],
  ['a tuple', TUPLE, ['row F', 12]],
  ['a union on its string branch', TEXT_OR_OBJECT, 'half past seven'],
];

// The same documents given something their schema refuses: the default opens,
// as it did before a non-object seed was read at all.
const REFUSED: ReadonlyArray<readonly [string, ZodType, unknown, unknown]> = [
  ['a list given a string', z.array(z.string()), 'oops', []],
  ['a list given numbers', z.array(z.string()), [1, 2], []],
  ['a string given a number', z.string(), 42, ''],
  ['a number given a string', z.number(), 'x', 0],
  ['a tuple given too few', TUPLE, ['only'], ['', 0]],
  ['a union given a number', TEXT_OR_OBJECT, 7, ''],
];

describe('createLoomEditor.open — the seed of a document whose root is not an object', () => {
  it.each(ACCEPTED)('%s opens with its seed', (_what, schema, seed) => {
    expect(opened(schema, seed)).toEqual(seed);
  });

  it.each(REFUSED)('%s opens the default', (_what, schema, seed, initial) => {
    expect(opened(schema, seed)).toEqual(initial);
  });

  it('opens the default when there is no seed', () => {
    expect(opened(z.array(z.string()))).toEqual([]);
    expect(opened(z.string())).toBe('');
  });

  it('the Prism plugin opens a config that is a literal or a list of nodes', () => {
    for (const seed of ['a literal string', 7, true, [{ $ref: '$.a' }, { $ref: '$.b' }]]) {
      const editor = createLoomEditor({ registry: anyKit() });
      editor.loadPlugin(prismPlugin({ input: {} }));
      editor.open({ type: 'prism', documents: { config: seed } });
      expect(editor.documents['config']).toEqual(seed);
      editor.dispose();
    }
  });
});

describe('createLoomEditor.open — the seed of an object document, as before', () => {
  const Booking = z.object({ member: z.string(), seats: z.number() });

  it('opens with its seed', () => {
    expect(opened(Booking, { member: 'grace', seats: 2 })).toEqual({ member: 'grace', seats: 2 });
  });

  it('keeps a seed object the schema refuses, for validation to flag', () => {
    expect(opened(Booking, { member: 5, extra: true })).toEqual({ member: 5, extra: true });
  });

  it('opens the default for a seed that is not an object', () => {
    expect(opened(Booking, 'oops')).toEqual({ member: '', seats: 0 });
    expect(opened(Booking, ['a'])).toEqual({ member: '', seats: 0 });
  });

  it('a union of objects opens with its seed', () => {
    const Shape = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('circle'), radius: z.number() }),
      z.object({ kind: z.literal('rect'), w: z.number(), h: z.number() }),
    ]);
    expect(opened(Shape, { kind: 'rect', w: 3, h: 4 })).toEqual({ kind: 'rect', w: 3, h: 4 });
  });
});

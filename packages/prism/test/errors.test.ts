import { describe, expect, it } from 'vitest';
import { flattenSchemaIssues } from '@niscorp/cortex';
import { compile, ConfigSchema, evaluate, execute, PrismError, validate } from '../src';
import { OP_MEMBERS } from '../src/schemas/node.schema';

const always = { check: 'always' } as const;

const failure = (run: () => unknown): PrismError => {
  try {
    run();
  } catch (error) {
    if (error instanceof PrismError) return error;
    throw error;
  }
  throw new Error('it did not fail');
};

type Case = { name: string; config: unknown; source?: unknown; code: string; op?: string; at: string; got?: string };

const NUM = { $ref: '$.n' };
const TEXT = { $ref: '$.t' };
const LIST = { $ref: '$.l' };
const OBJ = { $ref: '$.o' };
const SOURCE = { n: 5, t: 'x', l: [1], o: { a: 1 }, z: 0 };

// One wrong program for every place an op refuses its input.
const CASES: Case[] = [
  { name: '$trim', config: { s: { $trim: NUM } }, code: 'E_TYPE', op: '$trim', at: 's.$trim', got: 'the number 5' },
  { name: '$lower', config: { s: { $lower: NUM } }, code: 'E_TYPE', op: '$lower', at: 's.$lower', got: 'the number 5' },
  { name: '$upper', config: { s: { $upper: NUM } }, code: 'E_TYPE', op: '$upper', at: 's.$upper', got: 'the number 5' },
  { name: '$split', config: { s: { $split: { value: NUM, sep: ',' } } }, code: 'E_TYPE', op: '$split', at: 's.$split.value', got: 'the number 5' },
  { name: '$replace', config: { s: { $replace: { value: NUM, search: 'a', replacement: 'b' } } }, code: 'E_TYPE', op: '$replace', at: 's.$replace.value', got: 'the number 5' },
  { name: '$join', config: { s: { $join: { parts: OBJ } } }, code: 'E_TYPE', op: '$join', at: 's.$join.parts', got: 'an object: {"a":1}' },
  { name: '$interpolate', config: { s: { $interpolate: { template: '{{a}}', values: LIST } } }, code: 'E_TYPE', op: '$interpolate', at: 's.$interpolate.values', got: 'a list of 1 item: [1]' },
  { name: '$map', config: { s: { $map: { over: OBJ, as: 'x', body: 1 } } }, code: 'E_TYPE', op: '$map.over', at: 's.$map.over', got: 'an object' },
  { name: '$filter', config: { s: { $filter: { over: OBJ, as: 'x', when: true } } }, code: 'E_TYPE', op: '$filter.over', at: 's.$filter.over', got: 'an object' },
  { name: '$reduce', config: { s: { $reduce: { over: OBJ, as: 'x', init: 0, body: 1 } } }, code: 'E_TYPE', op: '$reduce.over', at: 's.$reduce.over', got: 'an object' },
  { name: '$flatten', config: { s: { $flatten: OBJ } }, code: 'E_TYPE', op: '$flatten', at: 's.$flatten', got: 'an object' },
  { name: '$unique', config: { s: { $unique: OBJ } }, code: 'E_TYPE', op: '$unique', at: 's.$unique', got: 'an object' },
  { name: '$sortBy.over', config: { s: { $sortBy: { over: OBJ, as: 'x', by: 1 } } }, code: 'E_TYPE', op: '$sortBy.over', at: 's.$sortBy.over', got: 'an object' },
  { name: '$sortBy.by', config: { s: { $sortBy: { over: LIST, as: 'x', by: OBJ } } }, code: 'E_TYPE', op: '$sortBy', at: 's.$sortBy.by', got: 'an object' },
  { name: '$slice', config: { s: { $slice: { from: NUM } } }, code: 'E_TYPE', op: '$slice', at: 's.$slice.from', got: 'the number 5' },
  { name: '$ref', config: { s: { $ref: '$.o.b' } }, code: 'E_MISSING_PATH', op: '$ref', at: 's.$ref', got: 'no key "b" (its keys: a)' },
  { name: '$var', config: { s: { $var: 'x' } }, code: 'E_VAR_NOT_FOUND', op: '$var', at: 's.$var', got: 'No variable is in scope here.' },
  { name: '$get index', config: { s: { $get: { from: OBJ, path: [0] } } }, code: 'E_TYPE', op: '$get', at: 's.$get.path', got: 'an object' },
  { name: '$get key', config: { s: { $get: { from: LIST, path: ['a'] } } }, code: 'E_TYPE', op: '$get', at: 's.$get.path', got: 'a list of 1 item' },
  { name: '$get missing', config: { s: { $get: { from: OBJ, path: ['b'] } } }, code: 'E_MISSING_PATH', op: '$get', at: 's.$get.path', got: 'no key "b"' },
  { name: '$add', config: { s: { $add: [1, TEXT] } }, code: 'E_TYPE', op: '$add', at: 's.$add.1', got: 'text "x"' },
  { name: '$sub', config: { s: { $sub: [TEXT, 1] } }, code: 'E_TYPE', op: '$sub', at: 's.$sub.0', got: 'text "x"' },
  { name: '$mul', config: { s: { $mul: [1, TEXT] } }, code: 'E_TYPE', op: '$mul', at: 's.$mul.1', got: 'text "x"' },
  { name: '$div', config: { s: { $div: [1, TEXT] } }, code: 'E_TYPE', op: '$div', at: 's.$div.1', got: 'text "x"' },
  { name: '$mod', config: { s: { $mod: [1, TEXT] } }, code: 'E_TYPE', op: '$mod', at: 's.$mod.1', got: 'text "x"' },
  { name: '$div by zero', config: { s: { $div: [1, { $ref: '$.z' }] } }, code: 'E_DIVISION_BY_ZERO', op: '$div', at: 's.$div.1' },
  { name: '$mod by zero', config: { s: { $mod: [1, { $ref: '$.z' }] } }, code: 'E_DIVISION_BY_ZERO', op: '$mod', at: 's.$mod.1' },
  { name: '$round', config: { s: { $round: { value: TEXT } } }, code: 'E_TYPE', op: '$round', at: 's.$round.value', got: 'text "x"' },
  { name: '$toNumber', config: { s: { $toNumber: { value: TEXT } } }, code: 'E_TYPE', op: '$toNumber', at: 's.$toNumber.value', got: 'text "x"' },
  { name: '$gt', config: { s: { $gt: [1, TEXT] } }, code: 'E_TYPE', op: '$gt', at: 's.$gt.1', got: 'text "x"' },
  { name: '$gte', config: { s: { $gte: [OBJ, 1] } }, code: 'E_TYPE', op: '$gte', at: 's.$gte.0', got: 'an object' },
  { name: '$lt', config: { s: { $lt: [1, TEXT] } }, code: 'E_TYPE', op: '$lt', at: 's.$lt.1', got: 'text "x"' },
  { name: '$lte', config: { s: { $lte: [1, TEXT] } }, code: 'E_TYPE', op: '$lte', at: 's.$lte.1', got: 'text "x"' },
  { name: '$startsWith', config: { s: { $startsWith: { value: TEXT, prefix: NUM } } }, code: 'E_TYPE', op: '$startsWith', at: 's.$startsWith.prefix', got: 'the number 5' },
  { name: '$endsWith', config: { s: { $endsWith: { value: NUM, suffix: 'a' } } }, code: 'E_TYPE', op: '$endsWith', at: 's.$endsWith.value', got: 'the number 5' },
  { name: '$contains', config: { s: { $contains: { value: TEXT, search: LIST } } }, code: 'E_TYPE', op: '$contains', at: 's.$contains.search', got: 'a list' },
  { name: '$merge', config: { s: { $merge: [OBJ, LIST] } }, code: 'E_TYPE', op: '$merge', at: 's.$merge.1', got: 'a list' },
  { name: '$entriesOf', config: { s: { $entriesOf: LIST } }, code: 'E_TYPE', op: '$entriesOf', at: 's.$entriesOf', got: 'a list' },
  { name: '$keyBy', config: { s: { $keyBy: { over: OBJ, as: 'x', key: 1 } } }, code: 'E_TYPE', op: '$keyBy', at: 's.$keyBy.over', got: 'an object' },
  { name: '$groupBy', config: { s: { $groupBy: { over: OBJ, as: 'x', key: 1 } } }, code: 'E_TYPE', op: '$groupBy', at: 's.$groupBy.over', got: 'an object' },
  { name: '$keys', config: { s: { $keys: LIST } }, code: 'E_TYPE', op: '$keys', at: 's.$keys', got: 'a list' },
  { name: '$values', config: { s: { $values: LIST } }, code: 'E_TYPE', op: '$values', at: 's.$values', got: 'a list' },
  { name: '$fromEntries', config: { s: { $fromEntries: OBJ } }, code: 'E_TYPE', op: '$fromEntries', at: 's.$fromEntries', got: 'an object' },
  { name: '$fromEntries item', config: { s: { $fromEntries: { $const: [['a', 1], 'b'] } } }, code: 'E_TYPE', op: '$fromEntries', at: 's.$fromEntries', got: 'item 1 is text "b"' },
  { name: '$pick', config: { s: { $pick: { from: LIST, keys: ['a'] } } }, code: 'E_TYPE', op: '$pick', at: 's.$pick.from', got: 'a list' },
  { name: '$omit', config: { s: { $omit: { from: LIST, keys: ['a'] } } }, code: 'E_TYPE', op: '$omit', at: 's.$omit.from', got: 'a list' },
  { name: '$length', config: { s: { $length: NUM } }, code: 'E_TYPE', op: '$length', at: 's.$length', got: 'the number 5' },
  { name: '$date', config: { s: { $date: { value: LIST } } }, code: 'E_TYPE', op: '$date', at: 's.$date.value', got: 'a list' },
  { name: '$date invalid', config: { s: { $date: { value: TEXT } } }, code: 'E_DATE_INVALID', op: '$date', at: 's.$date.value' },
  { name: '$dateAdd', config: { s: { $dateAdd: { date: LIST, amount: 1, unit: 'day' } } }, code: 'E_TYPE', op: '$dateAdd', at: 's.$dateAdd.date', got: 'a list' },
  { name: '$dateDiff.from', config: { s: { $dateDiff: { from: LIST, to: '2026-01-01', unit: 'day' } } }, code: 'E_TYPE', op: '$dateDiff.from', at: 's.$dateDiff.from', got: 'a list' },
  { name: '$dateDiff.to', config: { s: { $dateDiff: { from: '2026-01-01', to: TEXT, unit: 'day' } } }, code: 'E_DATE_INVALID', op: '$dateDiff.to', at: 's.$dateDiff.to' },
  { name: '$localeDate.locale', config: { s: { $localeDate: { value: '2026-01-01', locale: NUM } } }, code: 'E_TYPE', op: '$localeDate', at: 's.$localeDate.locale', got: 'the number 5' },
  { name: '$localeDate.value', config: { s: { $localeDate: { value: TEXT, locale: 'de-AT' } } }, code: 'E_DATE_INVALID', op: '$localeDate', at: 's.$localeDate.value' },
  { name: '$localeMoney.locale', config: { s: { $localeMoney: { value: 1, currency: 'EUR', locale: NUM } } }, code: 'E_TYPE', op: '$localeMoney', at: 's.$localeMoney.locale', got: 'the number 5' },
  { name: '$localeMoney.currency', config: { s: { $localeMoney: { value: 1, currency: NUM, locale: 'de-AT' } } }, code: 'E_TYPE', op: '$localeMoney', at: 's.$localeMoney.currency', got: 'the number 5' },
  { name: '$localeMoney.value', config: { s: { $localeMoney: { value: TEXT, currency: 'EUR', locale: 'de-AT' } } }, code: 'E_TYPE', op: '$localeMoney', at: 's.$localeMoney.value', got: 'text "x"' },
  { name: '$localeNumber.locale', config: { s: { $localeNumber: { value: 1, locale: NUM } } }, code: 'E_TYPE', op: '$localeNumber', at: 's.$localeNumber.locale', got: 'the number 5' },
  { name: '$localeNumber.value', config: { s: { $localeNumber: { value: TEXT, locale: 'de-AT' } } }, code: 'E_TYPE', op: '$localeNumber', at: 's.$localeNumber.value', got: 'text "x"' },
  { name: '$renameKeys', config: { s: { $renameKeys: { from: LIST, map: { a: 'b' } } } }, code: 'E_TYPE', op: '$renameKeys', at: 's.$renameKeys.from', got: 'a list' },
  { name: '$join item', config: { s: { $join: { parts: [TEXT, OBJ] } } }, code: 'E_TYPE', op: '$join', at: 's.$join.parts', got: 'item 1 is an object: {"a":1}' },
  { name: '$interpolate value', config: { s: { $interpolate: { template: '{{a}}', values: { a: LIST } } } }, code: 'E_TYPE', op: '$interpolate', at: 's.$interpolate.values', got: '"a" is a list of 1 item: [1]' },
  { name: '$keyBy key', config: { s: { $keyBy: { over: LIST, as: 'x', key: OBJ } } }, code: 'E_TYPE', op: '$keyBy', at: 's.$keyBy.key', got: 'an object: {"a":1}' },
  { name: '$groupBy key', config: { s: { $groupBy: { over: LIST, as: 'x', key: LIST } } }, code: 'E_TYPE', op: '$groupBy', at: 's.$groupBy.key', got: 'a list of 1 item: [1]' },
  { name: '$update', config: { s: { $update: { from: LIST, path: [3], value: 1 } } }, code: 'E_MISSING_PATH', op: '$update', at: 's.$update.path', got: 'a list of 1 item' },
];

describe('an error says what was received, where, and the form of the op', () => {
  it.each(CASES)('$name', ({ config, source, code, op, at, got }) => {
    const error = failure(() => evaluate(config as Parameters<typeof evaluate>[0], source ?? SOURCE, always));
    expect(error.code).toBe(code);
    expect(error.context?.op).toBe(op);
    expect(error.message).toContain(` At ${at}.`);
    if (got !== undefined) expect(error.message).toContain(got);
    if (code === 'E_TYPE') expect(error.message).toMatch(/ Form: \{"\$\w+": .*\}$/);
  });

  it('the pilot\'s wrapped $trim names the object, the way it was written, and where', () => {
    const program = {
      $map: {
        over: { $ref: '$.records' },
        as: 'r',
        body: { title: { $trim: { value: { $get: { from: { $var: 'r' }, path: ['fields', 'title', 0] } } } } },
      },
    };
    const error = failure(() => evaluate(program, { records: [{ fields: { title: ['Quarterly contributor outreach'] } }] }, always));
    expect(error.message).toBe(
      '$trim needs text, but got an object: {"value":"Quarterly contributor outreach"}. That object was written in the program as {"value":{"$get":{"from":{"$var":"r"},"path":["fields","titl…, and an object without a "$" key builds an object; put the node itself there. At $map.body.title.$trim. Form: {"$trim": <node>}',
    );
  });

  it('a path says where it stopped and what is there', () => {
    expect(failure(() => evaluate({ s: { $get: { from: { $ref: '$.f' }, path: ['link', 'href'] } } }, { f: { link: ['/a'] } }, always)).message).toBe(
      '$get.path ["link","href"] stopped at "href": the value at ["link"] is a list of 1 item: ["/a"], and a list is read by index, a number; for every item use $map. At s.$get.path. Form: {"$get": {"from": <node>, "path": [<text> or <number> or <node>, …], "fallback"?: <node>}}',
    );
    expect(failure(() => evaluate({ s: { $ref: '$.rows.name' } }, { rows: [{ name: 'a' }] }, always)).message).toBe(
      'Path not found. $ref "$.rows.name" stopped at "name": the value at $.rows is a list of 1 item: [{"name":"a"}], and a list is read by index, a number; for every item use $map. At s.$ref.',
    );
  });

  it('a variable that is not there lists the ones that are', () => {
    const config = { $map: { over: { $ref: '$.l' }, as: 'item', body: { $var: 'row' } } };
    expect(failure(() => evaluate(config, SOURCE, always)).message).toBe('Variable not found: row. In scope: item. At $map.body.$var.');
  });

  it('inside a sugar op, the position is the author\'s', () => {
    const at = (config: unknown, source: unknown): string => failure(() => evaluate(config as Parameters<typeof evaluate>[0], source, always)).message;
    expect(at({ s: { $sum: { over: { $const: ['1'] } } } }, {})).toContain(' At s.$sum, in the $add that $sum runs as. Form: {"$sum": {"over": <node>}}');
    expect(at({ s: { $avg: { over: { $const: [] } } } }, {})).toContain(' At s.$avg, in the $div that $avg runs as.');
    expect(at({ s: { $pluck: { over: OBJ, key: 'a' } } }, SOURCE)).toContain(' At s.$pluck.over, in the $map that $pluck runs as. Form: {"$pluck"');
    expect(at({ m: { $match: { over: { $const: ['a'] }, as: 'x', search: NUM } } }, SOURCE)).toContain(' At m.$match.search, in the $contains that $match runs as.');
    expect(at({ m: { $match: { over: LIST, as: 'x', search: 'a' } } }, SOURCE)).toContain(' At m.$match, in the $contains that $match runs as.');
    const inside = { s: { $sum: { over: { $map: { over: LIST, as: 'x', body: { $trim: { $var: 'x' } } } } } } };
    expect(at(inside, SOURCE)).toContain(' At s.$sum.over.$map.body.$trim. Form: {"$trim": <node>}');
  });

  it('a kept config reports the same position on every call', () => {
    const config = { s: { $sum: { over: { $map: { over: LIST, as: 'x', body: { $trim: { $var: 'x' } } } } } } };
    const messages = [1, 2, 3].map(() => failure(() => evaluate(config, SOURCE)).message);
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toContain(' At s.$sum.over.$map.body.$trim.');
  });

  it('execute gives the position in the compiled tree', async () => {
    const ir = await compile({ s: { $sum: { over: LIST } }, t: { $trim: NUM } });
    expect(failure(() => execute(ir, { l: [1], n: 5 })).message).toContain(' At t.$trim.');
    expect(failure(() => execute({ ...ir, core: { x: { $nope: 1 } } }, {})).message).toBe(
      'No op answers this node: {"$nope":1} (keys: $nope). The tree did not go through the schema. At x.',
    );
  });

  it('the budget says where it stopped', () => {
    const doubling = { $reduce: { over: { $const: [1, 2, 3, 4, 5, 6] }, as: 'x', init: 'ab', body: { $join: { parts: [{ $var: 'acc' }, { $var: 'acc' }] } } } };
    expect(failure(() => evaluate(doubling, {}, { limits: { maxStringLength: 64 } })).message).toBe(
      'Evaluation stopped: a string of 128 characters (limit 64). At $reduce.body.',
    );
  });

  it('an error a template\'s __optional field catches leaves the answer as it was', () => {
    expect(evaluate({ a: { $ref: '$.missing' }, b: 1, __optional: ['a'] }, {})).toEqual({ b: 1 });
  });
});

describe('a refused config says what is wrong in the message', () => {
  it('evaluate puts the issues in its message, as compile does', async () => {
    const config = { x: { $get: { from: { $ref: '$' }, path: 'a.b' } } };
    const message = 'Invalid config: x.$get.path: Invalid input: expected array, received string. Form: {"$get": {"from": <node>, "path": [<text> or <number> or <node>, …], "fallback"?: <node>}}';
    expect(failure(() => evaluate(config as Parameters<typeof evaluate>[0], {}, always)).message).toBe(message);
    await expect(compile(config)).rejects.toMatchObject({ message });
  });

  it('a form is added for the op an issue is on, and for no other', () => {
    const issue = (config: unknown): string => {
      const result = validate(config);
      return result.ok ? 'ok' : result.issues.map((i) => i.message).join(' | ');
    };
    expect(issue({ x: { $trim: { $ref: '$.a' }, fallback: '' } })).toBe('Unrecognized key: "fallback". Form: {"$trim": <node>}');
    expect(issue({ $map: { over: { $ref: '$.a' }, body: 1 } })).toBe('Invalid input: expected string, received undefined. Form: {"$map": {"over": <node>, "as": <text>, "body": <node>}}');
    expect(issue({ x: { $first: { $ref: '$.a' } } })).toBe('Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.');
    expect(issue({ $case: { branches: [{ when: true, then: 1 }], else: { $todo: 1 } } })).toBe('Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.');
    expect(issue({ a: 1, $map: 2 })).toBe('An op name cannot be a plain object key. Use the op itself.');
  });
});

describe('an object whose only key names an op is checked as that op', () => {
  const printed = (config: unknown): string => {
    const parsed = ConfigSchema.safeParse(config);
    return parsed.success ? 'ok' : flattenSchemaIssues(parsed.error.issues).map((i) => `${i.path.join('/')}: ${i.message}`).join('; ');
  };

  it('so a formatter that picks among union branches gets the op\'s own issues', () => {
    const misplaced = {
      $map: {
        over: { $filter: { over: { $ref: '$.records' }, as: 'r', when: true }, as: 'r', body: { $merge: [] } },
      },
    };
    expect(printed(misplaced)).toBe('$map/over: Unrecognized keys: "as", "body"; $map/as: Invalid input: expected string, received undefined; $map/body: Invalid input: expected string, received undefined');
    expect(printed({ x: { $first: { $ref: '$.a' } } })).toBe('x/$first: Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.');
  });

  it('which is safe because every op schema is strict and has only its own key', () => {
    for (const member of OP_MEMBERS) {
      const { def } = member._zod;
      const shape: unknown = Reflect.get(def, 'shape');
      const catchall: unknown = Reflect.get(def, 'catchall');
      expect(typeof shape === 'object' && shape !== null ? Object.keys(shape).length : 0).toBe(1);
      expect(typeof catchall === 'object' && catchall !== null ? Reflect.get(Reflect.get(catchall, '_zod'), 'def').type : undefined).toBe('never');
    }
    expect(OP_MEMBERS.length).toBe(75);
  });
});

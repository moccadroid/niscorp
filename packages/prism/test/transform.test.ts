import { describe, it, expect } from 'vitest';
import { compile, execute, evaluate, validate, type Config, type JsonObject } from '../src';
import { OP_KEYS } from '../src/schemas';

// Transform ops — rewriting a document rather than deriving a value (strata S3).
// Every case runs twice: interpreted (evaluate) and compiled (execute), which
// must agree — the optimizer attaches handlers to the new ops like any other.

const both = async (config: Config, source: Parameters<typeof evaluate>[1]) => {
  const interpreted = evaluate(config, source);
  const compiled = execute(await compile(config), source as Parameters<typeof execute>[1]);
  expect(compiled).toEqual(interpreted);
  return interpreted;
};

describe('$has — is the key there at all?', () => {
  it('a key present with null counts; a missing one does not', async () => {
    const src = { doc: { props: { label: null } } };
    expect(await both({ $has: { from: { $ref: '$.doc' }, path: ['props', 'label'] } }, src)).toBe(true);
    expect(await both({ $has: { from: { $ref: '$.doc' }, path: ['props', 'text'] } }, src)).toBe(false);
    expect(await both({ $has: { from: { $ref: '$.doc' }, path: ['props', 'label', 'deeper'] } }, src)).toBe(false);
  });

  it('indexes into arrays', async () => {
    expect(await both({ $has: { from: { $ref: '$.xs' }, path: [1] } }, { xs: ['a', 'b'] })).toBe(true);
    expect(await both({ $has: { from: { $ref: '$.xs' }, path: [2] } }, { xs: ['a', 'b'] })).toBe(false);
  });
});

describe('$renameKeys — in place, order kept', () => {
  it('renames keys where they stand', async () => {
    const out = await both({ $renameKeys: { from: { $ref: '$.doc' }, map: { body: 'request', transform: 'response' } } }, { doc: { url: '/x', body: { a: 1 }, transform: { b: 2 }, target: 'rows' } });
    expect(Object.keys(out as object)).toEqual(['url', 'request', 'response', 'target']);
    expect(out).toEqual({ url: '/x', request: { a: 1 }, response: { b: 2 }, target: 'rows' });
  });

  it('absent keys are ignored; a rename onto an existing key replaces it', async () => {
    expect(await both({ $renameKeys: { from: { $ref: '$.doc' }, map: { nope: 'x' } } }, { doc: { a: 1 } })).toEqual({ a: 1 });
    expect(await both({ $renameKeys: { from: { $ref: '$.doc' }, map: { label: 'text' } } }, { doc: { text: 'old', label: 'new' } })).toEqual({ text: 'new' });
  });
});

describe('$update — one path changed, everything else identical', () => {
  it('sets a deep path and sees the current value', async () => {
    const out = await both(
      { $update: { from: { $ref: '$.doc' }, path: ['props', 'count'], value: { $add: [{ $var: 'current' }, 1] } } },
      { doc: { component: 'Counter', props: { count: 4, label: 'x' }, ref: 'c' } },
    );
    expect(out).toEqual({ component: 'Counter', props: { count: 5, label: 'x' }, ref: 'c' });
  });

  it('creates missing objects along a string path; `as` renames the binding', async () => {
    expect(await both({ $update: { from: { $ref: '$.doc' }, path: ['meta', 'v'], as: 'was', value: { $coalesce: [{ $var: 'was' }, 1] } } }, { doc: {} })).toEqual({ meta: { v: 1 } });
  });

  it('an array index that does not exist is an error', () => {
    expect(() => evaluate({ $update: { from: { $ref: '$.xs' }, path: [5], value: 1 } }, { xs: [0] })).toThrow(/No array item/);
  });
});

describe('$assert — a migration refuses what it cannot handle', () => {
  it('passes the value through when the condition holds, and throws E_ASSERT with the message when not', () => {
    const config: Config = { $assert: { when: { $has: { from: { $ref: '$.doc' }, path: ['id'] } }, message: 'An action without an id cannot be migrated.', value: { $ref: '$.doc.id' } } };
    expect(evaluate(config, { doc: { id: 'a' } })).toBe('a');
    expect(() => evaluate(config, { doc: {} })).toThrow(expect.objectContaining({ code: 'E_ASSERT', message: 'An action without an id cannot be migrated.' }));
  });
});

describe('$walk — every node of a tree, any depth', () => {
  // The relay rename from git history (af0d9b8): the state key `q` became
  // `search` everywhere — `ref: 'q'`, `{ set: 'q' }`, and every path string
  // beginning `$.q`. As a whole-tree transform without $walk this took 22.5 KB
  // of unrolled Prism; with it, three rules.
  const qToSearch: Config = {
    $walk: {
      over: { $ref: '$.document' },
      as: 'n',
      rules: [
        { when: { $eq: [{ $var: 'n' }, '$.q'] }, then: '$.search' },
        { when: { $and: [{ $eq: [{ $type: { $var: 'n' } }, 'string'] }, { $startsWith: { value: { $var: 'n' }, prefix: '$.q.' } }] }, then: { $replace: { value: { $var: 'n' }, search: '$.q.', replacement: '$.search.' } } },
        {
          when: { $or: [{ $eq: [{ $get: { from: { $var: 'n' }, path: ['ref'], fallback: null } }, 'q'] }, { $eq: [{ $get: { from: { $var: 'n' }, path: ['set'], fallback: null } }, 'q'] }] },
          then: { $renameKeys: { from: { $var: 'n' }, map: {} } },
        },
      ],
    },
  };
  // The third rule's shape change is expressed with $update below; the walk
  // above proves the string rules alone.
  // A walk visits every node — objects too — so a string op needs its type
  // checked first ($and short-circuits).
  const before: JsonObject = {
    data: { q: '', rows: [] },
    layout: { component: 'Stack', children: [{ component: 'Input', model: '$.q', ref: 'q' }, { for: '$.rows', as: 'r', do: { component: 'Text', props: { value: '$.q.length' } } }] },
    triggers: [{ event: 'ui:input', ref: 'q', do: [{ set: 'q', value: '@event.payload' }] }],
    endpoints: { load: { request: { context: { q: { $ref: '$.q' } } } } },
  };

  it('rewrites matching leaves at every depth, including inside an embedded Prism config', async () => {
    const out = JSON.stringify(await both(qToSearch, { document: before }));
    expect(out).toContain('"model":"$.search"');
    expect(out).toContain('"value":"$.search.length"');
    expect(out).toContain('{"$ref":"$.search"}');
    expect(out).not.toContain('"$.q');
  });

  it('with $update inside a rule, renames the `ref`/`set` values too — the whole commit in one walk', async () => {
    const renameValues: Config = {
      $walk: {
        over: { $ref: '$.document' },
        as: 'n',
        rules: [
          { when: { $eq: [{ $var: 'n' }, '$.q'] }, then: '$.search' },
          { when: { $and: [{ $eq: [{ $type: { $var: 'n' } }, 'string'] }, { $startsWith: { value: { $var: 'n' }, prefix: '$.q.' } }] }, then: { $replace: { value: { $var: 'n' }, search: '$.q.', replacement: '$.search.' } } },
          { when: { $eq: [{ $get: { from: { $var: 'n' }, path: ['ref'], fallback: null } }, 'q'] }, then: { $update: { from: { $var: 'n' }, path: ['ref'], value: 'search' } } },
          { when: { $eq: [{ $get: { from: { $var: 'n' }, path: ['set'], fallback: null } }, 'q'] }, then: { $update: { from: { $var: 'n' }, path: ['set'], value: 'search' } } },
        ],
      },
    };
    const out = await both(renameValues, { document: before });
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/"ref":"q"|"set":"q"|"\$\.q/);
    expect(text).toContain('"ref":"search"');
    expect(text).toContain('"set":"search"');
    // `data.q` is a KEY, not a value — the rename of the key itself is a $renameKeys at the root.
    expect((out as { data: object }).data).toEqual({ q: '', rows: [] });
  });

  it('post-order (default): a node\'s rules see its children already rewritten', async () => {
    const out = await both(
      { $walk: { over: { $ref: '$.t' }, as: 'n', rules: [{ when: { $eq: [{ $var: 'n' }, 1] }, then: 2 }, { when: { $eq: [{ $var: 'n' }, [2, 2]] }, then: 'both rewritten' }] } },
      { t: { pair: [1, 1] } },
    );
    expect(out).toEqual({ pair: 'both rewritten' });
  });

  it('pre-order: rules see the node as it was, then the walk descends into the replacement', async () => {
    const out = await both(
      { $walk: { over: { $ref: '$.t' }, as: 'n', order: 'pre', rules: [{ when: { $eq: [{ $var: 'n' }, [1, 1]] }, then: ['seen before', 1] }, { when: { $eq: [{ $var: 'n' }, 1] }, then: 2 }] } },
      { t: { pair: [1, 1] } },
    );
    expect(out).toEqual({ pair: ['seen before', 2] });
  });

  it('a replacement is not walked again at its own level — it terminates', async () => {
    const out = await both({ $walk: { over: { $ref: '$.t' }, as: 'n', rules: [{ when: { $eq: [{ $type: { $var: 'n' } }, 'number'] }, then: [{ $var: 'n' }] }] } }, { t: [1, 2] });
    expect(out).toEqual([[1], [2]]);
  });
});

describe('$ref: "$" — the whole source', () => {
  it('is never constant-folded: compiled, it reads the source it is given (it used to fold to {})', async () => {
    const ir = await compile({ $ref: '$' });
    expect(ir.meta.stats.optimizations.constantsFolded).toBe(0);
    expect(execute(ir, { b: 2 })).toEqual({ b: 2 });
  });

  it('"$" is the root (and "$." still works)', async () => {
    expect(await both({ $ref: '$' }, { a: 1 })).toEqual({ a: 1 });
    expect(await both({ $ref: '$.' }, { a: 1 })).toEqual({ a: 1 });
  });
});

describe('$join — computed parts', () => {
  it('parts may be any node that evaluates to an array; a literal list means what it always did', async () => {
    expect(await both({ $join: { parts: { $map: { over: { $ref: '$.xs' }, as: 'x', body: { $upper: { $var: 'x' } } } }, sep: ', ' } }, { xs: ['a', 'b'] })).toBe('A, B');
    expect(await both({ $join: { parts: ['Hi ', { $ref: '$.name' }, '!'] } }, { name: 'Ada' })).toBe('Hi Ada!');
  });
});

describe('validation errors say WHERE', () => {
  const issueOf = (config: unknown): string => {
    const result = validate(config);
    return result.ok ? '(valid)' : result.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ');
  };

  it('a typo inside an op deep in a $map points at the op, not the root', () => {
    expect(issueOf({ rows: { $map: { over: { $ref: '$.x' }, as: 'i', body: { name: { $get: { from: { $var: 'i' }, pathh: ['n'] } } } } } })).toContain(
      'rows.$map.body.name.$get: Unrecognized key: "pathh"',
    );
  });

  it('a missing field names the field', () => {
    expect(issueOf({ $case: { branches: [{ when: true }], else: 1 } })).toContain('$case.branches.0.then');
  });

  it('an op name used as a template key says so', () => {
    expect(issueOf({ a: 1, $has: 2 })).toBe('$has: An op name cannot be a plain object key. Use the op itself.');
  });
});

// ═══════════════════════════════════════════════════════════
// A Prism op is never removed or reshaped. Configs are stored — as endpoint
// requests, vex mappings, and strata migrations — and a migration cannot be
// migrated by the language it is written in. An old form stays and desugars
// to the new one. This list is the record: removing an op fails here; adding
// one means adding it here, on purpose.
// ═══════════════════════════════════════════════════════════
const EVERY_OP_EVER = [
  '$ref', '$const', '$var', '$get', '$with',
  '$map', '$filter', '$reduce', '$slice', '$flatten', '$unique', '$sortBy',
  '$add', '$sub', '$mul', '$div', '$round',
  '$fill', '$join', '$toString', '$interpolate', '$trim', '$lower', '$upper', '$split', '$replace',
  '$eq', '$neq', '$gt', '$gte', '$lt', '$lte', '$empty', '$startsWith', '$endsWith', '$contains',
  '$not', '$and', '$or',
  '$merge', '$coalesce', '$case', '$entriesOf', '$keyBy', '$groupBy',
  '$keys', '$values', '$fromEntries', '$pick', '$omit', '$type', '$length',
  '$date', '$dateAdd', '$dateDiff',
  '$localeDate', '$localeMoney', '$localeNumber',
  '$sum', '$avg', '$count', '$min', '$max',
  '$pluck', '$take', '$drop', '$match', '$flatMap',
  '$has', '$renameKeys', '$update', '$assert', '$walk',
];

describe('the op set only ever grows', () => {
  it('every op that ever existed still exists', () => {
    const gone = EVERY_OP_EVER.filter((op) => !(OP_KEYS as readonly string[]).includes(op));
    expect(gone, 'removed ops — keep them as sugar that desugars to the new form').toEqual([]);
  });

  it('every op that exists is on the record', () => {
    const unrecorded = (OP_KEYS as readonly string[]).filter((op) => !EVERY_OP_EVER.includes(op));
    expect(unrecorded, 'new ops — add them to EVERY_OP_EVER').toEqual([]);
  });
});

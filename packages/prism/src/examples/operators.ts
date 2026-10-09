import type { PrismExample } from './example.types';

// One example for each operator, named by the operator, in the groups the
// reference puts them in (./groups.ts, DOCS.md). test/examples.test.ts holds
// that no operator in OP_KEYS is left out and none is shown twice.
export const OPERATORS: readonly PrismExample[] = [
  {
    id: 'ref',
    group: 'core',
    title: '$ref',
    description:
      'Reads a value out of the source by JSONPath. A path starts with `$.` and names fields or array indexes.',
    op: '$ref',
    source: {
      user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
      items: [{ sku: 'A1' }, { sku: 'A2' }, { sku: 'A3' }],
    },
    config: { $ref: '$.user.name' },
    expected: 'Ada Lovelace',
  },
  {
    id: 'const',
    group: 'core',
    title: '$const',
    description:
      'A literal value, returned as it is written. Any JSON value can stand where an expression is expected by wrapping it in `$const`.',
    op: '$const',
    source: {},
    config: { $const: 42 },
    expected: 42,
  },
  {
    id: 'var',
    group: 'core',
    title: '$var',
    description:
      'Reads a name bound further up: by `$with`, or by the `as` of `$map`, `$filter` and the other operators that go through a list. A name that is not in scope refuses with E_VAR_NOT_FOUND.',
    op: '$var',
    source: { price: 40, rate: 0.2 },
    config: {
      $with: {
        let: { tax: { $mul: [{ $ref: '$.price' }, { $ref: '$.rate' }] } },
        value: { $var: 'tax' },
      },
    },
    expected: 8,
  },
  {
    id: 'get',
    group: 'core',
    title: '$get',
    description:
      'Walks into a value along a list of path segments: keys, indexes, or expressions that evaluate to one. With `fallback` a missing path gives the fallback; without it the config refuses with E_MISSING_PATH.',
    op: '$get',
    source: {
      catalog: { A1: { title: 'Apple', stock: 12 }, B1: { title: 'Banana', stock: 0 } },
      selected: 'B1',
    },
    config: {
      title: { $get: { from: { $ref: '$.catalog' }, path: [{ $ref: '$.selected' }, 'title'] } },
      shelf: {
        $get: {
          from: { $ref: '$.catalog' },
          path: [{ $ref: '$.selected' }, 'shelf'],
          fallback: { $const: 'unknown' },
        },
      },
    },
    expected: { title: 'Banana', shelf: 'unknown' },
  },
  {
    id: 'with',
    group: 'core',
    title: '$with',
    description:
      'Names values once for use further down. What `let` binds is read with `$var`, and only inside `value`.',
    op: '$with',
    source: {},
    config: {
      $with: {
        let: { a: { $const: 10 }, b: { $const: 32 } },
        value: { $add: [{ $var: 'a' }, { $var: 'b' }] },
      },
    },
    expected: 42,
  },
  {
    id: 'map',
    group: 'arrays',
    title: '$map',
    description:
      'Transforms each element of an array. The element is bound to the variable named by `as`, and `body` is evaluated once for each.',
    op: '$map',
    source: { numbers: [1, 2, 3, 4, 5] },
    config: {
      $map: {
        over: { $ref: '$.numbers' },
        as: 'n',
        body: { $mul: [{ $var: 'n' }, { $const: 2 }] },
      },
    },
    expected: [2, 4, 6, 8, 10],
  },
  {
    id: 'filter',
    group: 'arrays',
    title: '$filter',
    description: 'Keeps the elements of an array for which `when` is truthy.',
    op: '$filter',
    source: {
      items: [
        { name: 'Apple', price: 1.5 },
        { name: 'Banana', price: 0.5 },
        { name: 'Carrot', price: 2 },
        { name: 'Date', price: 3 },
      ],
    },
    config: {
      $filter: {
        over: { $ref: '$.items' },
        as: 'item',
        when: {
          $gte: [{ $get: { from: { $var: 'item' }, path: ['price'] } }, { $const: 1.5 }],
        },
      },
    },
    expected: [
      { name: 'Apple', price: 1.5 },
      { name: 'Carrot', price: 2 },
      { name: 'Date', price: 3 },
    ],
  },
  {
    id: 'reduce',
    group: 'arrays',
    title: '$reduce',
    description:
      'Folds an array into one value. The element and what has been gathered so far are both in scope inside `body`; the accumulator is called `acc` unless named.',
    op: '$reduce',
    source: { numbers: [3, 1, 4, 1, 5, 9, 2, 6] },
    config: {
      $reduce: {
        over: { $ref: '$.numbers' },
        as: 'n',
        acc: 'total',
        init: { $const: 0 },
        body: { $add: [{ $var: 'total' }, { $var: 'n' }] },
      },
    },
    expected: 31,
  },
  {
    id: 'slice',
    group: 'arrays',
    title: '$slice',
    description:
      'A stretch of an array or of a string, from `start` up to but not including `end`. `start` defaults to 0 and `end` to the length.',
    op: '$slice',
    source: { letters: ['a', 'b', 'c', 'd', 'e'], word: 'transform' },
    config: {
      middle: { $slice: { from: { $ref: '$.letters' }, start: 1, end: 4 } },
      prefix: { $slice: { from: { $ref: '$.word' }, start: 0, end: 5 } },
    },
    expected: { middle: ['b', 'c', 'd'], prefix: 'trans' },
  },
  {
    id: 'flatten',
    group: 'arrays',
    title: '$flatten',
    description:
      'Flattens an array of arrays by one level. An element that is not an array is kept as it is.',
    op: '$flatten',
    source: { nested: [[1, 2], [3], 4, [5, [6]]] },
    config: { $flatten: { $ref: '$.nested' } },
    expected: [1, 2, 3, 4, 5, [6]],
  },
  {
    id: 'unique',
    group: 'arrays',
    title: '$unique',
    description:
      'Removes repeated values from an array, keeping the first of each. Values are compared by their JSON text, so objects and arrays count too.',
    op: '$unique',
    source: { tags: ['draft', 'review', 'draft', 'done', 'review'] },
    config: { $unique: { $ref: '$.tags' } },
    expected: ['draft', 'review', 'done'],
  },
  {
    id: 'sort-by',
    group: 'arrays',
    title: '$sortBy',
    description:
      'Sorts an array by a key computed for each element. `dir` is `asc` unless it says `desc`; keys may be numbers or strings.',
    op: '$sortBy',
    source: {
      items: [
        { name: 'Carrot', price: 2 },
        { name: 'Apple', price: 1.5 },
        { name: 'Date', price: 3 },
      ],
    },
    config: {
      $sortBy: {
        over: { $ref: '$.items' },
        as: 'item',
        by: { $get: { from: { $var: 'item' }, path: ['price'] } },
        dir: 'desc',
      },
    },
    expected: [
      { name: 'Date', price: 3 },
      { name: 'Carrot', price: 2 },
      { name: 'Apple', price: 1.5 },
    ],
  },
  {
    id: 'add',
    group: 'math',
    title: '$add',
    description:
      'Adds two numbers. Each of the four arithmetic operators takes exactly two operands, and an operand is any expression.',
    op: '$add',
    source: { price: 99, tax: 8 },
    config: { $add: [{ $ref: '$.price' }, { $ref: '$.tax' }] },
    expected: 107,
  },
  {
    id: 'sub',
    group: 'math',
    title: '$sub',
    description: 'Subtracts the second number from the first.',
    op: '$sub',
    source: { total: 100, discount: 15 },
    config: { $sub: [{ $ref: '$.total' }, { $ref: '$.discount' }] },
    expected: 85,
  },
  {
    id: 'mul',
    group: 'math',
    title: '$mul',
    description: 'Multiplies two numbers.',
    op: '$mul',
    source: { quantity: 3, unitPrice: 25 },
    config: { $mul: [{ $ref: '$.quantity' }, { $ref: '$.unitPrice' }] },
    expected: 75,
  },
  {
    id: 'div',
    group: 'math',
    title: '$div',
    description:
      'Divides the first number by the second. Dividing by zero refuses with E_DIVISION_BY_ZERO.',
    op: '$div',
    source: { total: 100, people: 8 },
    config: { $div: [{ $ref: '$.total' }, { $ref: '$.people' }] },
    expected: 12.5,
  },
  {
    id: 'mod',
    group: 'math',
    title: '$mod',
    description:
      'The remainder of the first number divided by the second. It takes the sign of the second, so with a positive divisor it is never negative. Dividing by zero refuses with E_DIVISION_BY_ZERO.',
    op: '$mod',
    source: { row: 7, behind: -1 },
    config: { stripe: { $mod: [{ $ref: '$.row' }, 2] }, slot: { $mod: [{ $ref: '$.behind' }, 5] } },
    expected: { stripe: 1, slot: 4 },
  },
  {
    id: 'round',
    group: 'math',
    title: '$round',
    description:
      'Rounds a number to a number of digits. `digits` is 0 unless given. `mode` rounds down with "floor" or up with "ceil" where it would round to the nearest.',
    op: '$round',
    source: { total: 100, guests: 7 },
    config: {
      $round: { value: { $div: [{ $ref: '$.total' }, { $ref: '$.guests' }] }, digits: 2 },
    },
    expected: 14.29,
  },
  {
    id: 'to-number',
    group: 'math',
    title: '$toNumber',
    description:
      'A number from a number or from numeric text, as a form, a CSV or an API often sends it. Anything else refuses with E_TYPE, unless `fallback` says what to answer.',
    op: '$toNumber',
    source: { price: '38.50', qty: 2, discount: 'none' },
    config: {
      total: { $mul: [{ $toNumber: { value: { $ref: '$.price' } } }, { $toNumber: { value: { $ref: '$.qty' } } }] },
      discount: { $toNumber: { value: { $ref: '$.discount' }, fallback: 0 } },
    },
    expected: { total: 77, discount: 0 },
  },
  {
    id: 'join',
    group: 'strings',
    title: '$join',
    description:
      'Joins parts into one string with `sep` between them. Parts are turned into strings, and `parts` may be a list or any expression that evaluates to one.',
    op: '$join',
    source: { first: 'Ada', last: 'Lovelace' },
    config: { $join: { parts: [{ $ref: '$.first' }, { $ref: '$.last' }], sep: ' ' } },
    expected: 'Ada Lovelace',
  },
  {
    id: 'to-string',
    group: 'strings',
    title: '$toString',
    description:
      'Any value as a string: a number as its digits, null as "null", an object or array as its JSON text.',
    op: '$toString',
    source: { count: 42, nothing: null, point: { x: 1, y: 2 } },
    config: {
      count: { $toString: { $ref: '$.count' } },
      nothing: { $toString: { $ref: '$.nothing' } },
      point: { $toString: { $ref: '$.point' } },
    },
    expected: { count: '42', nothing: 'null', point: '{"x":1,"y":2}' },
  },
  {
    id: 'interpolate',
    group: 'strings',
    title: '$interpolate',
    description:
      'Fills the `{{key}}` placeholders of a template with the matching values. The template is written out; `values` is an object of expressions, or one expression that gives an object.',
    op: '$interpolate',
    source: { user: { first: 'Ada', last: 'Lovelace' }, count: 3 },
    config: {
      $interpolate: {
        template: 'Welcome, {{first}} {{last}}! You have {{count}} new messages.',
        values: {
          first: { $ref: '$.user.first' },
          last: { $ref: '$.user.last' },
          count: { $ref: '$.count' },
        },
      },
    },
    expected: 'Welcome, Ada Lovelace! You have 3 new messages.',
  },
  {
    id: 'fill',
    group: 'strings',
    title: '$fill',
    description:
      'Fills a counted phrase with its own slots: a value of the form `{ phrase, slots }` becomes the phrase with each `{slot}` replaced. A value of any other form passes through unchanged.',
    op: '$fill',
    source: {
      progress: { phrase: '{n} of {total}', slots: { n: 1, total: 12 } },
      plain: 'done',
    },
    config: {
      filled: { $fill: { $ref: '$.progress' } },
      untouched: { $fill: { $ref: '$.plain' } },
    },
    expected: { filled: '1 of 12', untouched: 'done' },
  },
  {
    id: 'trim',
    group: 'strings',
    title: '$trim',
    description: 'Removes the whitespace at both ends of a string.',
    op: '$trim',
    source: { raw: '  Ada Lovelace  ' },
    config: { $trim: { $ref: '$.raw' } },
    expected: 'Ada Lovelace',
  },
  {
    id: 'lower',
    group: 'strings',
    title: '$lower',
    description: 'A string in lowercase.',
    op: '$lower',
    source: { name: 'Ada Lovelace' },
    config: { $lower: { $ref: '$.name' } },
    expected: 'ada lovelace',
  },
  {
    id: 'upper',
    group: 'strings',
    title: '$upper',
    description: 'A string in uppercase.',
    op: '$upper',
    source: { name: 'Ada Lovelace' },
    config: { $upper: { $ref: '$.name' } },
    expected: 'ADA LOVELACE',
  },
  {
    id: 'split',
    group: 'strings',
    title: '$split',
    description: 'Cuts a string into a list at every `sep`.',
    op: '$split',
    source: { csv: 'apple,banana,cherry' },
    config: { $split: { value: { $ref: '$.csv' }, sep: ',' } },
    expected: ['apple', 'banana', 'cherry'],
  },
  {
    id: 'replace',
    group: 'strings',
    title: '$replace',
    description: 'Swaps the first occurrence of `search` in a string for `replacement`, or every occurrence with `all: true`.',
    op: '$replace',
    source: { csv: 'apple,banana,cherry' },
    config: { $replace: { value: { $ref: '$.csv' }, search: 'banana', replacement: '***' } },
    expected: 'apple,***,cherry',
  },
  {
    id: 'eq',
    group: 'predicates',
    title: '$eq',
    description:
      'True when two values are the same. They are compared by their JSON text, so lists and objects compare as well as numbers and strings.',
    op: '$eq',
    source: { status: 'active' },
    config: { $eq: [{ $ref: '$.status' }, { $const: 'active' }] },
    expected: true,
  },
  {
    id: 'neq',
    group: 'predicates',
    title: '$neq',
    description: 'True when two values differ. The opposite of `$eq`, compared the same way.',
    op: '$neq',
    source: { role: 'editor' },
    config: { $neq: [{ $ref: '$.role' }, { $const: 'admin' }] },
    expected: true,
  },
  {
    id: 'gt',
    group: 'predicates',
    title: '$gt',
    description:
      'True when the first value is greater than the second. Numbers compare by size, strings by alphabet.',
    op: '$gt',
    source: { age: 36 },
    config: { $gt: [{ $ref: '$.age' }, { $const: 18 }] },
    expected: true,
  },
  {
    id: 'gte',
    group: 'predicates',
    title: '$gte',
    description: 'True when the first value is greater than the second, or equal to it.',
    op: '$gte',
    source: { age: 18 },
    config: { $gte: [{ $ref: '$.age' }, { $const: 18 }] },
    expected: true,
  },
  {
    id: 'lt',
    group: 'predicates',
    title: '$lt',
    description: 'True when the first value is less than the second.',
    op: '$lt',
    source: { stock: 3 },
    config: { $lt: [{ $ref: '$.stock' }, { $const: 5 }] },
    expected: true,
  },
  {
    id: 'lte',
    group: 'predicates',
    title: '$lte',
    description: 'True when the first value is less than the second, or equal to it.',
    op: '$lte',
    source: { score: 100 },
    config: { $lte: [{ $ref: '$.score' }, { $const: 100 }] },
    expected: true,
  },
  {
    id: 'empty',
    group: 'predicates',
    title: '$empty',
    description:
      'True for null, an empty string, an empty list and an empty object. Everything else is not empty, 0 and false included.',
    op: '$empty',
    source: { nothing: null, text: '', list: [], zero: 0 },
    config: {
      nothing: { $empty: { $ref: '$.nothing' } },
      text: { $empty: { $ref: '$.text' } },
      list: { $empty: { $ref: '$.list' } },
      zero: { $empty: { $ref: '$.zero' } },
    },
    expected: { nothing: true, text: true, list: true, zero: false },
  },
  {
    id: 'starts-with',
    group: 'predicates',
    title: '$startsWith',
    description: 'True when a string begins with `prefix`.',
    op: '$startsWith',
    source: { url: 'https://nisc.dev' },
    config: { $startsWith: { value: { $ref: '$.url' }, prefix: { $const: 'https://' } } },
    expected: true,
  },
  {
    id: 'ends-with',
    group: 'predicates',
    title: '$endsWith',
    description: 'True when a string ends with `suffix`.',
    op: '$endsWith',
    source: { file: 'notes.json' },
    config: { $endsWith: { value: { $ref: '$.file' }, suffix: { $const: '.json' } } },
    expected: true,
  },
  {
    id: 'contains',
    group: 'predicates',
    title: '$contains',
    description: 'True when a string has `search` somewhere in it.',
    op: '$contains',
    source: { name: 'Ada Lovelace' },
    config: { $contains: { value: { $ref: '$.name' }, search: { $const: 'Love' } } },
    expected: true,
  },
  {
    id: 'and',
    group: 'logic',
    title: '$and',
    description:
      'Gives its first falsy operand, or the last one when all are truthy, and evaluates no further than that.',
    op: '$and',
    source: { user: { age: 25, hasPaidPlan: true } },
    config: {
      $and: [{ $gte: [{ $ref: '$.user.age' }, { $const: 18 }] }, { $ref: '$.user.hasPaidPlan' }],
    },
    expected: true,
  },
  {
    id: 'or',
    group: 'logic',
    title: '$or',
    description:
      'Gives its first truthy operand, or the last one when none is, and evaluates no further than that.',
    op: '$or',
    source: { user: { nickname: null, name: 'Ada' } },
    config: { $or: [{ $ref: '$.user.nickname' }, { $ref: '$.user.name' }] },
    expected: 'Ada',
  },
  {
    id: 'not',
    group: 'logic',
    title: '$not',
    description: 'True for a falsy value, false for a truthy one.',
    op: '$not',
    source: { user: { isVerified: false } },
    config: { $not: { $ref: '$.user.isVerified' } },
    expected: true,
  },
  {
    id: 'merge',
    group: 'structure',
    title: '$merge',
    description:
      'Merges objects one level deep, left to right. A key in a later object replaces the same key in an earlier one.',
    op: '$merge',
    source: {
      defaults: { theme: 'light', fontSize: 14, autoSave: true },
      overrides: { theme: 'dark', fontSize: 16 },
    },
    config: { $merge: [{ $ref: '$.defaults' }, { $ref: '$.overrides' }] },
    expected: { theme: 'dark', fontSize: 16, autoSave: true },
  },
  {
    id: 'coalesce',
    group: 'structure',
    title: '$coalesce',
    description: 'The first of its values that is not null.',
    op: '$coalesce',
    source: { user: { name: null, displayName: null, email: 'ada@example.com' } },
    config: {
      $coalesce: [
        { $ref: '$.user.name' },
        { $ref: '$.user.displayName' },
        { $ref: '$.user.email' },
        { $const: '(no name available)' },
      ],
    },
    expected: 'ada@example.com',
  },
  {
    id: 'case',
    group: 'structure',
    title: '$case',
    description:
      'Branches. They are tried in order: the first whose `when` is truthy gives its `then`, and `else` answers when none is.',
    op: '$case',
    source: { score: 87 },
    config: {
      $case: {
        branches: [
          {
            when: { $gte: [{ $ref: '$.score' }, { $const: 90 }] },
            then: { $const: 'A' },
          },
          {
            when: { $gte: [{ $ref: '$.score' }, { $const: 80 }] },
            then: { $const: 'B' },
          },
          {
            when: { $gte: [{ $ref: '$.score' }, { $const: 70 }] },
            then: { $const: 'C' },
          },
        ],
        else: { $const: 'F' },
      },
    },
    expected: 'B',
  },
  {
    id: 'entries-of',
    group: 'structure',
    title: '$entriesOf',
    description: "Turns an object into a list of `[key, value]` pairs, in the object's own order.",
    op: '$entriesOf',
    source: { settings: { theme: 'dark', fontSize: 16 } },
    config: { $entriesOf: { $ref: '$.settings' } },
    expected: [
      ['theme', 'dark'],
      ['fontSize', 16],
    ],
  },
  {
    id: 'key-by',
    group: 'structure',
    title: '$keyBy',
    description:
      'Turns a list of records into an object keyed by a value computed for each. Where two records give the same key, the later one stays.',
    op: '$keyBy',
    source: {
      products: [
        { sku: 'A1', name: 'Apple', price: 1.5 },
        { sku: 'B1', name: 'Banana', price: 0.5 },
        { sku: 'C1', name: 'Cherry', price: 3 },
      ],
    },
    config: {
      $keyBy: {
        over: { $ref: '$.products' },
        as: 'p',
        key: { $get: { from: { $var: 'p' }, path: ['sku'] } },
      },
    },
    expected: {
      A1: { sku: 'A1', name: 'Apple', price: 1.5 },
      B1: { sku: 'B1', name: 'Banana', price: 0.5 },
      C1: { sku: 'C1', name: 'Cherry', price: 3 },
    },
  },
  {
    id: 'group-by',
    group: 'structure',
    title: '$groupBy',
    description:
      'Sorts a list of records into an object of lists, one for each value of a computed key.',
    op: '$groupBy',
    source: {
      items: [
        { name: 'Apple', category: 'fruit' },
        { name: 'Banana', category: 'fruit' },
        { name: 'Carrot', category: 'vegetable' },
        { name: 'Date', category: 'fruit' },
        { name: 'Eggplant', category: 'vegetable' },
      ],
    },
    config: {
      $groupBy: {
        over: { $ref: '$.items' },
        as: 'item',
        key: { $get: { from: { $var: 'item' }, path: ['category'] } },
      },
    },
    expected: {
      fruit: [
        { name: 'Apple', category: 'fruit' },
        { name: 'Banana', category: 'fruit' },
        { name: 'Date', category: 'fruit' },
      ],
      vegetable: [
        { name: 'Carrot', category: 'vegetable' },
        { name: 'Eggplant', category: 'vegetable' },
      ],
    },
  },
  {
    id: 'keys',
    group: 'objects',
    title: '$keys',
    description: "The keys of an object as a list, in the object's own order.",
    op: '$keys',
    source: { settings: { theme: 'dark', fontSize: 16, autoSave: true } },
    config: { $keys: { $ref: '$.settings' } },
    expected: ['theme', 'fontSize', 'autoSave'],
  },
  {
    id: 'values',
    group: 'objects',
    title: '$values',
    description: "The values of an object as a list, in the object's own order.",
    op: '$values',
    source: { settings: { theme: 'dark', fontSize: 16, autoSave: true } },
    config: { $values: { $ref: '$.settings' } },
    expected: ['dark', 16, true],
  },
  {
    id: 'from-entries',
    group: 'objects',
    title: '$fromEntries',
    description:
      'Turns a list of `[key, value]` pairs into an object. The opposite of `$entriesOf`.',
    op: '$fromEntries',
    source: {
      pairs: [
        ['x', 1],
        ['y', 2],
      ],
    },
    config: { $fromEntries: { $ref: '$.pairs' } },
    expected: { x: 1, y: 2 },
  },
  {
    id: 'pick',
    group: 'objects',
    title: '$pick',
    description: 'Keeps the named keys of an object and drops the rest.',
    op: '$pick',
    source: {
      user: {
        id: 'u_42',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        passwordHash: 'sekret-do-not-share',
        sessionToken: 'also-sekret',
        createdAt: '2024-01-01',
      },
    },
    config: { $pick: { from: { $ref: '$.user' }, keys: ['id', 'name', 'email', 'createdAt'] } },
    expected: {
      id: 'u_42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      createdAt: '2024-01-01',
    },
  },
  {
    id: 'omit',
    group: 'objects',
    title: '$omit',
    description: 'Drops the named keys of an object and keeps the rest.',
    op: '$omit',
    source: {
      user: {
        id: 'u_42',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        passwordHash: 'sekret-do-not-share',
        sessionToken: 'also-sekret',
        createdAt: '2024-01-01',
      },
    },
    config: { $omit: { from: { $ref: '$.user' }, keys: ['passwordHash', 'sessionToken'] } },
    expected: {
      id: 'u_42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      createdAt: '2024-01-01',
    },
  },
  {
    id: 'type',
    group: 'objects',
    title: '$type',
    description:
      'Names what kind of value something is: `string`, `number`, `boolean`, `null`, `array` or `object`.',
    op: '$type',
    source: { text: 'hello', count: 3, on: true, nothing: null, list: [1, 2], record: { a: 1 } },
    config: {
      text: { $type: { $ref: '$.text' } },
      count: { $type: { $ref: '$.count' } },
      on: { $type: { $ref: '$.on' } },
      nothing: { $type: { $ref: '$.nothing' } },
      list: { $type: { $ref: '$.list' } },
      record: { $type: { $ref: '$.record' } },
    },
    expected: {
      text: 'string',
      count: 'number',
      on: 'boolean',
      nothing: 'null',
      list: 'array',
      record: 'object',
    },
  },
  {
    id: 'length',
    group: 'objects',
    title: '$length',
    description: 'How many elements a list has, or how many characters a string has.',
    op: '$length',
    source: { tags: ['math', 'engine', 'notes'], name: 'Ada Lovelace' },
    config: { tags: { $length: { $ref: '$.tags' } }, name: { $length: { $ref: '$.name' } } },
    expected: { tags: 3, name: 12 },
  },
  {
    id: 'has',
    group: 'transform',
    title: '$has',
    description:
      'True when the whole path exists. A key that is there with the value null counts; a key that is missing does not.',
    op: '$has',
    source: { document: { id: 'save', props: { label: null } } },
    config: {
      label: { $has: { from: { $ref: '$.document' }, path: ['props', 'label'] } },
      tone: { $has: { from: { $ref: '$.document' }, path: ['props', 'tone'] } },
    },
    expected: { label: true, tone: false },
  },
  {
    id: 'rename-keys',
    group: 'transform',
    title: '$renameKeys',
    description:
      'Renames keys of an object where they stand, so the order of the keys is kept. A key that is not there is passed over.',
    op: '$renameKeys',
    source: { endpoint: { url: '/api/todos', body: { done: false }, transform: 'rows' } },
    config: {
      $renameKeys: {
        from: { $ref: '$.endpoint' },
        map: { body: 'request', transform: 'response', headers: 'meta' },
      },
    },
    expected: { url: '/api/todos', request: { done: false }, response: 'rows' },
  },
  {
    id: 'update',
    group: 'transform',
    title: '$update',
    description:
      'Changes the value at one path and returns everything else identical. The value now at the path is bound as `current` (null when it is absent) for the new value to be computed from.',
    op: '$update',
    source: { document: { component: 'Stepper', props: { count: 3, label: 'Seats' } } },
    config: {
      $update: {
        from: { $ref: '$.document' },
        path: ['props', 'count'],
        value: { $add: [{ $var: 'current' }, { $const: 1 }] },
      },
    },
    expected: { component: 'Stepper', props: { count: 4, label: 'Seats' } },
  },
  {
    id: 'assert',
    group: 'transform',
    title: '$assert',
    description:
      'Gives `value` when `when` is truthy, and otherwise refuses with E_ASSERT and the message. It is how a config says what it will not work on.',
    op: '$assert',
    source: { document: { id: 'todos.list', title: 'Todos' } },
    config: {
      $assert: {
        when: { $has: { from: { $ref: '$.document' }, path: ['id'] } },
        message: 'A document without an id cannot be migrated.',
        value: { $ref: '$.document' },
      },
    },
    expected: { id: 'todos.list', title: 'Todos' },
  },
  {
    id: 'walk',
    group: 'transform',
    title: '$walk',
    description:
      'Visits every node of a tree, at any depth, and replaces a node with the first rule whose `when` holds for it. Children are rewritten before their parent unless `order` is `pre`. A walk visits objects and lists as well as leaves, so a rule for strings checks the type first.',
    op: '$walk',
    source: {
      document: {
        component: 'Stack',
        children: [
          { component: 'Text', children: '{{$.q}}' },
          { component: 'Field', props: { value: '$.q' } },
        ],
      },
    },
    config: {
      $walk: {
        over: { $ref: '$.document' },
        as: 'n',
        rules: [
          {
            when: { $eq: [{ $var: 'n' }, { $const: '$.q' }] },
            then: { $const: '$.search' },
          },
          {
            when: { $eq: [{ $var: 'n' }, { $const: '{{$.q}}' }] },
            then: { $const: '{{$.search}}' },
          },
        ],
      },
    },
    expected: {
      component: 'Stack',
      children: [
        { component: 'Text', children: '{{$.search}}' },
        { component: 'Field', props: { value: '$.search' } },
      ],
    },
  },
  {
    id: 'date',
    group: 'time',
    title: '$date',
    description: 'Writes a date in a given format. The format is a dayjs format string.',
    op: '$date',
    source: { createdAt: '2024-01-15T08:30:00Z' },
    config: { $date: { value: { $ref: '$.createdAt' }, format: 'YYYY-MM-DD' } },
    expected: '2024-01-15',
  },
  {
    id: 'date-add',
    group: 'time',
    title: '$dateAdd',
    description: 'Moves a date by an amount of a unit. A negative amount moves it back.',
    op: '$dateAdd',
    source: { createdAt: '2024-01-15T08:30:00Z' },
    config: {
      $date: {
        value: { $dateAdd: { date: { $ref: '$.createdAt' }, amount: 30, unit: 'day' } },
        format: 'YYYY-MM-DD',
      },
    },
    expected: '2024-02-14',
  },
  {
    id: 'date-diff',
    group: 'time',
    title: '$dateDiff',
    description: 'Measures from one date to another, in a unit.',
    op: '$dateDiff',
    source: { createdAt: '2024-01-15T08:30:00Z', now: '2024-04-22T10:00:00Z' },
    config: { $dateDiff: { from: { $ref: '$.createdAt' }, to: { $ref: '$.now' }, unit: 'day' } },
    expected: 98,
  },
  {
    id: 'locale-money',
    group: 'locale',
    title: '$localeMoney',
    description:
      'An amount as money, the way a reader in a given locale expects it. The value is in minor units (cents) unless `minorUnits` is false. `locale` is required: there is no default, because any default is wrong for most readers.',
    op: '$localeMoney',
    source: { price_cents: 4500, currency: 'EUR' },
    config: {
      $localeMoney: {
        value: { $ref: '$.price_cents' },
        currency: { $ref: '$.currency' },
        locale: 'en-IE',
      },
    },
    expected: '€45.00',
  },
  {
    id: 'locale-date',
    group: 'locale',
    title: '$localeDate',
    description:
      'A date for a reader in a given locale. `locale` is required. A date without a time is read as UTC, so it does not slip a day west of Greenwich.',
    op: '$localeDate',
    source: { starts_on: '2026-03-14' },
    config: { $localeDate: { value: { $ref: '$.starts_on' }, locale: 'en-GB' } },
    expected: '14 Mar 2026',
  },
  {
    id: 'locale-number',
    group: 'locale',
    title: '$localeNumber',
    description:
      'A number for a reader in a given locale: grouping and the decimal mark follow the locale. `locale` is required, and `style` may be `percent`.',
    op: '$localeNumber',
    source: { attendance: 1234.5 },
    config: {
      $localeNumber: { value: { $ref: '$.attendance' }, locale: 'de-DE', minDigits: 1 },
    },
    expected: '1.234,5',
  },
];

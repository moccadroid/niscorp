import { bench, describe, beforeAll } from 'vitest';
import { compile, evaluate, execute, type CompiledIr } from '../src';

// ═══════════════════════════════════════════════════════════
// Benchmarks comparing raw evaluate(config, source) against
// execute(ir, source) where the IR is precompiled once.
//
// The compile cost is paid ONCE at startup; the per-iteration
// cost only measures evaluation.
//
// Run via:  pnpm --filter @niscorp/prism bench
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// Scenario 1 — Tiny literal (constant folding paradise)
// ─────────────────────────────────────────────────────────
const tinyConfig = {
  $add: [
    { $mul: [{ $const: 6 }, { $const: 7 }] },
    { $sub: [{ $const: 100 }, { $const: 58 }] },
  ],
};
const tinySource = {};

// ─────────────────────────────────────────────────────────
// Scenario 2 — Simple ref-heavy (pluck fields from a record)
// ─────────────────────────────────────────────────────────
const refConfig = {
  id: { $ref: '$.user.id' },
  name: { $ref: '$.user.name' },
  email: { $ref: '$.user.email' },
  city: { $ref: '$.user.address.city' },
  country: { $ref: '$.user.address.country' },
};
const refSource = {
  user: {
    id: 'u_42',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    address: { city: 'London', country: 'UK' },
  },
};

// ─────────────────────────────────────────────────────────
// Scenario 3 — Map over a small array
// ─────────────────────────────────────────────────────────
const mapConfig = {
  $map: {
    over: { $ref: '$.items' },
    as: 'item',
    body: {
      sku: { $get: { from: { $var: 'item' }, path: ['sku'] } },
      total: {
        $mul: [
          { $get: { from: { $var: 'item' }, path: ['price'] } },
          { $get: { from: { $var: 'item' }, path: ['qty'] } },
        ],
      },
    },
  },
};
const mapSource = {
  items: Array.from({ length: 20 }, (_, i) => ({ sku: `A${i}`, price: 10 + i, qty: 1 + (i % 5) })),
};

// ─────────────────────────────────────────────────────────
// Scenario 4 — Nested $with + $filter + $sortBy + $map
// ─────────────────────────────────────────────────────────
const nestedConfig = {
  $with: {
    let: {
      threshold: { $const: 50 },
    },
    value: {
      $sortBy: {
        over: {
          $filter: {
            over: { $ref: '$.products' },
            as: 'p',
            when: {
              $gte: [
                { $get: { from: { $var: 'p' }, path: ['price'] } },
                { $var: 'threshold' },
              ],
            },
          },
        },
        as: 'p',
        by: { $get: { from: { $var: 'p' }, path: ['price'] } },
        dir: 'desc',
      },
    },
  },
};
const nestedSource = {
  products: Array.from({ length: 100 }, (_, i) => ({
    name: `Product ${i}`,
    price: ((i * 7) % 200) + 10,
    inStock: i % 3 !== 0,
  })),
};

// ─────────────────────────────────────────────────────────
// Scenario 5 — Real-world denormalize join (100 users × 200 posts)
// ─────────────────────────────────────────────────────────
const joinConfig = {
  $map: {
    over: { $ref: '$.users' },
    as: 'user',
    body: {
      id: { $get: { from: { $var: 'user' }, path: ['id'] } },
      name: { $get: { from: { $var: 'user' }, path: ['name'] } },
      postCount: {
        $reduce: {
          over: { $ref: '$.posts' },
          as: 'post',
          acc: 'acc',
          init: { $const: 0 },
          body: {
            $case: {
              branches: [
                {
                  when: {
                    $eq: [
                      { $get: { from: { $var: 'post' }, path: ['authorId'] } },
                      { $get: { from: { $var: 'user' }, path: ['id'] } },
                    ],
                  },
                  then: { $add: [{ $var: 'acc' }, { $const: 1 }] },
                },
              ],
              else: { $var: 'acc' },
            },
          },
        },
      },
    },
  },
};
const joinSource = {
  users: Array.from({ length: 100 }, (_, i) => ({ id: `u${i}`, name: `User ${i}` })),
  posts: Array.from({ length: 200 }, (_, i) => ({
    id: `p${i}`,
    authorId: `u${i % 100}`,
    title: `Post ${i}`,
  })),
};

// ─────────────────────────────────────────────────────────
// Pre-compiled IRs (compile cost is amortized — out of the loop)
// ─────────────────────────────────────────────────────────
let tinyIr: CompiledIr;
let refIr: CompiledIr;
let mapIr: CompiledIr;
let nestedIr: CompiledIr;
let joinIr: CompiledIr;

beforeAll(async () => {
  tinyIr = await compile(tinyConfig);
  refIr = await compile(refConfig);
  mapIr = await compile(mapConfig);
  nestedIr = await compile(nestedConfig);
  joinIr = await compile(joinConfig);
});

// ─────────────────────────────────────────────────────────
// Benchmarks — each scenario times evaluate vs execute
// ─────────────────────────────────────────────────────────

describe('1. tiny literal arithmetic', () => {
  bench('evaluate (no IR)', () => {
    evaluate(tinyConfig, tinySource);
  });
  bench('execute (IR — constants folded)', () => {
    execute(tinyIr, tinySource);
  });
});

describe('2. ref-heavy field pluck', () => {
  bench('evaluate (no IR)', () => {
    evaluate(refConfig, refSource);
  });
  bench('execute (IR — segments inlined + handlers attached)', () => {
    execute(refIr, refSource);
  });
});

describe('3. map over 20 items', () => {
  bench('evaluate (no IR)', () => {
    evaluate(mapConfig, mapSource);
  });
  bench('execute (IR — handlers attached)', () => {
    execute(mapIr, mapSource);
  });
});

describe('4. nested with + filter + sort over 100 products', () => {
  bench('evaluate (no IR)', () => {
    evaluate(nestedConfig, nestedSource);
  });
  bench('execute (IR)', () => {
    execute(nestedIr, nestedSource);
  });
});

describe('5. denormalize join — 100 users × 200 posts', () => {
  bench('evaluate (no IR)', () => {
    evaluate(joinConfig, joinSource);
  });
  bench('execute (IR)', () => {
    execute(joinIr, joinSource);
  });
});

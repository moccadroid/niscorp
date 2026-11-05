import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  prepareArtifact,
  defineOperation,
  artifactStamp,
  ArtifactError,
  RunControl,
} from '../src/index.js';

const stamp = await artifactStamp();
const ref = (path: string): { $ref: string } => ({ $ref: path });
const flow = (steps: unknown[] = [], output: unknown = ref('$.input')) => ({
  inputSchema: {},
  outputSchema: {},
  steps,
  output,
});
const identity = defineOperation({ input: z.json(), output: z.json(), run: (input) => input });
let passed = 0;
const check = async (name: string, run: () => Promise<void>): Promise<void> => {
  await run();
  passed++;
  console.log('[pass] engine data: ' + name);
};

await check(
  'literal data is shared by root, nested helper, each and check scopes without caller override',
  async () => {
    const document = {
      stamp,
      data: { required: 'frozen' },
      flow: flow(
        [{ id: 'nested', call: { flow: { id: 'read', revision: 1 } }, input: ref('$.input') }],
        { root: ref('$.data.required'), nested: ref('$.steps.nested.value') },
      ),
      flows: [
        {
          id: 'read',
          revision: 1,
          flow: flow(
            [
              {
                id: 'items',
                call: { operation: 'identity' },
                input: {
                  data: ref('$.data.required'),
                  input: ref('$.input.data'),
                  item: ref('$.item'),
                },
                each: { items: ref('$.input.items'), onFailure: 'stop' },
                checks: [
                  { id: 'same-data', test: { $eq: [ref('$.value.data'), ref('$.data.required')] } },
                ],
              },
            ],
            ref('$.steps.items.value'),
          ),
        },
      ],
    };
    const prepared = await prepareArtifact(document, { identity });
    assert.deepEqual((await prepared.run({ data: 'caller', items: [1, 2] })).value, {
      root: 'frozen',
      nested: [
        { status: 'completed', value: { data: 'frozen', input: 'caller', item: 1 }, error: null },
        { status: 'completed', value: { data: 'frozen', input: 'caller', item: 2 }, error: null },
      ],
    });
  },
);
await check(
  'data remains opaque literal JSON, including dollar and own prototype keys',
  async () => {
    const data = JSON.parse(
      '{"$notAnOperation":{"$ref":"$.missing"},"__proto__":{"retained":true},"nested":{"$concat":[1,2]}}',
    );
    const prepared = await prepareArtifact(
      { stamp: { ...stamp, 'nisc.prism': 0 }, data, flow: flow([], ref('$.data')) },
      {},
    );
    const outcome = await prepared.run(null);
    assert.equal(outcome.status, 'completed');
    assert.deepEqual(outcome.value, data);
    assert(
      outcome.value !== null && typeof outcome.value === 'object' && !Array.isArray(outcome.value),
    );
    assert(Object.hasOwn(outcome.value, '__proto__'));
    assert.equal(Object.getPrototypeOf(outcome.value), Object.prototype);
  },
);
await check(
  'data is owned before preparation awaits and unchanged across concurrent runs',
  async () => {
    const document = {
      stamp,
      data: { nested: { value: 1 } },
      flow: flow(
        [
          {
            id: 'read',
            call: { operation: 'identity' },
            input: { data: ref('$.data'), input: ref('$.input') },
          },
        ],
        ref('$.steps.read.value'),
      ),
    };
    const preparing = prepareArtifact(document, { identity });
    document.data.nested.value = 99;
    const prepared = await preparing;
    const [one, two] = await Promise.all([prepared.run('one'), prepared.run('two')]);
    assert.deepEqual(one.value, { data: { nested: { value: 1 } }, input: 'one' });
    assert.deepEqual(two.value, { data: { nested: { value: 1 } }, input: 'two' });
    const missing = await prepareArtifact({ stamp, flow: flow([], ref('$.data')) }, {});
    assert.deepEqual((await missing.run(null)).value, {});
  },
);
await check(
  'invalid literal data fails before effects and cancellation remains terminal',
  async () => {
    let calls = 0;
    const operation = defineOperation({
      input: z.json(),
      output: z.json(),
      run: (input) => {
        calls++;
        return input;
      },
    });
    for (const data of [null, [], { bad: () => true }])
      await assert.rejects(
        prepareArtifact(
          {
            stamp,
            data,
            flow: flow([{ id: 'effect', call: { operation: 'effect' }, input: null }]),
          },
          { effect: operation },
        ),
        ArtifactError,
      );
    assert.equal(calls, 0);
    const prepared = await prepareArtifact(
      {
        stamp,
        data: { fixed: true },
        flow: flow([{ id: 'effect', call: { operation: 'effect' }, input: ref('$.data') }]),
      },
      { effect: operation },
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      prepared.run(null, { signal: controller.signal }),
      (error) => error instanceof RunControl && error.code === 'CANCELLED',
    );
    assert.equal(calls, 0);
  },
);
await check(
  'computed failure names read original item/data/value and preserve exact check identity',
  async () => {
    const condition = { selector: 'h1', minimum: 1, maximum: 1 };
    const document = {
      stamp,
      data: { prefix: 'discovery-required-precondition:' },
      flow: flow([
        {
          id: 'check',
          call: { operation: 'identity' },
          each: { items: ref('$.input'), onFailure: 'stop' },
          input: ref('$.item.minimum'),
          checks: [
            {
              id: {
                $join: {
                  parts: [
                    ref('$.data.prefix'),
                    {
                      $toString: {
                        selector: ref('$.item.selector'),
                        minimum: ref('$.value'),
                        maximum: ref('$.item.maximum'),
                      },
                    },
                  ],
                  sep: '',
                },
              },
              test: false,
            },
          ],
        },
      ]),
    };
    const outcome = await (await prepareArtifact(document, { identity })).run([condition]);
    assert.equal(outcome.status, 'failed');
    assert.deepEqual(outcome.error, {
      code: 'CHECK_FAILED',
      message: 'Check failed: discovery-required-precondition:' + JSON.stringify(condition),
    });
  },
);
await check(
  'failure names are lazy but every name expression is compiled before any effect',
  async () => {
    const lazy = {
      stamp,
      flow: flow(
        [
          {
            id: 'ok',
            call: { operation: 'identity' },
            input: 1,
            checks: [{ id: ref('$.input.absent'), test: true }],
          },
        ],
        ref('$.steps.ok.value'),
      ),
    };
    assert.equal((await (await prepareArtifact(lazy, { identity })).run({})).value, 1);
    let effects = 0;
    const effect = defineOperation({
      input: z.json(),
      output: z.json(),
      run: (input) => {
        effects++;
        return input;
      },
    });
    const invalid = flow([
      {
        id: 'unused',
        call: { operation: 'effect' },
        input: 1,
        when: false,
        checks: [{ id: { $notAnOperation: 1 }, test: true }],
      },
    ]);
    await assert.rejects(
      prepareArtifact(
        {
          stamp,
          flow: flow([{ id: 'effect', call: { operation: 'effect' }, input: 1 }]),
          flows: [{ id: 'unused', revision: 1, flow: invalid }],
        },
        { effect },
      ),
      /schema|operation/i,
    );
    assert.equal(effects, 0);
    for (const id of ['', false, []])
      await assert.rejects(
        prepareArtifact(
          {
            stamp,
            flow: flow([
              {
                id: 'check',
                call: { operation: 'identity' },
                input: 1,
                checks: [{ id, test: false }],
              },
            ]),
          },
          { identity },
        ),
        ArtifactError,
      );
  },
);
await check(
  'computed empty/non-string names are contract errors, never recorded ordinary failures',
  async () => {
    for (const id of [{ $const: '' }, { $const: false }]) {
      const prepared = await prepareArtifact(
        {
          stamp,
          flow: flow([
            {
              id: 'check',
              call: { operation: 'identity' },
              input: 1,
              each: { items: [1], onFailure: 'record' },
              checks: [{ id, test: false }],
            },
          ]),
        },
        { identity },
      );
      await assert.rejects(
        prepared.run(null),
        (error) => error instanceof ArtifactError && error.code === 'INVALID_VALUE',
      );
    }
  },
);
await check(
  'old engine documents upgrade and current data/check-name grammar is stamped',
  async () => {
    assert.equal(stamp['eden.engine'], 1);
    const old = {
      stamp: { ...stamp, 'eden.engine': 0 },
      flow: flow([
        {
          id: 'check',
          call: { operation: 'identity' },
          input: 1,
          checks: [{ id: 'literal', test: false }],
        },
      ]),
    };
    const outcome = await (await prepareArtifact(old, { identity })).run(null);
    assert.equal(outcome.error?.message, 'Check failed: literal');
    await assert.rejects(
      prepareArtifact({ ...old, stamp: { ...stamp, 'eden.engine': 2 } }, {}),
      /newer|ahead|version/i,
    );
  },
);
console.log('Engine data: ' + passed + ' behavior groups passed.');
await check(
  'pure values bind ordinary step outcomes and preserve false/null/scalar results',
  async () => {
    const prepared = await prepareArtifact(
      {
        stamp,
        data: { offset: 2 },
        flow: flow(
          [
            { id: 'one', value: { $add: [ref('$.input'), ref('$.data.offset')] } },
            { id: 'two', value: { $mul: [ref('$.steps.one.value'), 3] } },
            { id: 'nil', value: null },
            { id: 'no', value: false },
            { id: 'zero', value: 0 },
          ],
          {
            number: ref('$.steps.two.value'),
            nil: ref('$.steps.nil.value'),
            no: ref('$.steps.no.value'),
            zero: ref('$.steps.zero.value'),
          },
        ),
      },
      {},
    );
    assert.deepEqual((await prepared.run(4)).value, { number: 18, nil: null, no: false, zero: 0 });
  },
);
await check(
  'iterated pure values share ordered outcomes, skip/check/transform semantics and record failures',
  async () => {
    const prepared = await prepareArtifact(
      {
        stamp,
        flow: flow(
          [
            {
              id: 'values',
              value: { $mul: [ref('$.item'), 2] },
              when: { $neq: [ref('$.item'), 3] },
              each: { items: ref('$.input'), onFailure: 'record' },
              checks: [
                {
                  id: { $join: { parts: ['value:', { $toString: ref('$.item') }], sep: '' } },
                  test: { $lt: [ref('$.value'), 4] },
                },
              ],
              output: { $add: [ref('$.value'), 10] },
            },
          ],
          ref('$.steps.values.value'),
        ),
      },
      {},
    );
    assert.deepEqual((await prepared.run([1, 2, 3])).value, [
      { status: 'completed', value: 12, error: null },
      {
        status: 'failed',
        value: null,
        error: { code: 'CHECK_FAILED', message: 'Check failed: value:2' },
      },
      { status: 'skipped', value: null, error: null },
    ]);
  },
);
await check(
  'pure and call forms are exclusive and incomplete forms fail grammar admission',
  async () => {
    for (const step of [
      { id: 'bad', call: { operation: 'identity' }, input: 1, value: 1 },
      { id: 'bad' },
      { id: 'bad', input: 1 },
      { id: 'bad', value: 1, input: 1 },
      { id: 'bad', call: { operation: 'identity' }, value: 1 },
    ])
      await assert.rejects(
        prepareArtifact({ stamp, flow: flow([step]) }, { identity }),
        ArtifactError,
      );
  },
);
await check(
  'invalid pure expressions are compiled before earlier effects and despite inactive steps',
  async () => {
    let calls = 0;
    const effect = defineOperation({
      input: z.json(),
      output: z.json(),
      run: (input) => {
        calls++;
        return input;
      },
    });
    for (const plan of [
      {
        stamp,
        flow: flow([
          { id: 'effect', call: { operation: 'effect' }, input: 1 },
          { id: 'inactive', value: { $missingOperator: 1 }, when: false },
        ]),
      },
      {
        stamp,
        flow: flow([{ id: 'effect', call: { operation: 'effect' }, input: 1 }]),
        flows: [
          {
            id: 'unused',
            revision: 1,
            flow: flow([{ id: 'value', value: { $missingOperator: 1 } }]),
          },
        ],
      },
    ])
      await assert.rejects(
        prepareArtifact(plan, { effect }),
        (error) =>
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'E_SCHEMA',
      );
    assert.equal(calls, 0);
  },
);
await check(
  'pure work observes step/item/Prism budgets, shares root depth and obeys cancellation',
  async () => {
    const plan = {
      stamp,
      flow: flow(
        [
          { id: 'one', value: 1 },
          { id: 'two', value: 2 },
        ],
        ref('$.steps.two.value'),
      ),
    };
    assert.equal((await (await prepareArtifact(plan, {}, { maxDepth: 1 })).run(null)).value, 2);
    await assert.rejects(
      (await prepareArtifact(plan, {}, { maxSteps: 1 })).run(null),
      (error) => error instanceof RunControl && error.code === 'STEPS',
    );
    const repeated = {
      stamp,
      flow: flow([
        { id: 'each', value: ref('$.item'), each: { items: ref('$.input'), onFailure: 'stop' } },
      ]),
    };
    await assert.rejects(
      (await prepareArtifact(repeated, {}, { maxItems: 1 })).run([1, 2]),
      (error) => error instanceof RunControl && error.code === 'ITEMS',
    );
    const prism = {
      stamp,
      flow: flow([
        {
          id: 'many',
          value: { $map: { over: ref('$.input'), as: 'item', body: { $var: 'item' } } },
        },
      ]),
    };
    await assert.rejects(
      (await prepareArtifact(prism, {}, { prism: { maxSteps: 2 } })).run([1, 2, 3]),
      (error) =>
        error !== null && typeof error === 'object' && 'code' in error && error.code === 'E_BUDGET',
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      (await prepareArtifact(plan, {})).run(null, { signal: controller.signal }),
      (error) => error instanceof RunControl && error.code === 'CANCELLED',
    );
  },
);
await check('pure expression failures remain terminal in record mode', async () => {
  const prepared = await prepareArtifact(
    {
      stamp,
      flow: flow([
        {
          id: 'divide',
          value: { $div: [1, ref('$.item')] },
          each: { items: [0], onFailure: 'record' },
        },
      ]),
    },
    {},
  );
  await assert.rejects(
    prepared.run(null),
    (error) =>
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'E_DIVISION_BY_ZERO',
  );
});
console.log('Engine data/pure values total: ' + passed + ' behavior groups passed.');

import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  prepareArtifact,
  defineOperation,
  artifactStamp,
  OperationFailure,
  RunControl,
  ArtifactError,
  type Operation,
  type Operations,
} from '../src/index.js';
const stamp = await artifactStamp();
const ref = (path: string): { $ref: string } => ({ $ref: path });
const flow = (steps: unknown[] = [], output: unknown = ref('$.input')) => ({
  inputSchema: {},
  outputSchema: {},
  steps,
  output,
});
const artifact = (
  steps: unknown[] = [],
  output: unknown = ref('$.input'),
  flows: unknown[] = [],
) => ({ stamp, flow: flow(steps, output), flows });
const native = (
  run: (input: unknown) => unknown | Promise<unknown>,
  input: z.ZodType = z.unknown(),
  output: z.ZodType = z.unknown(),
): Operation => defineOperation({ input, output, run });
const identity = native((input) => input);
const registry: Operations = { identity };
let passed = 0;
const check = async (name: string, run: () => Promise<void>): Promise<void> => {
  await run();
  passed++;
  process.stdout.write('[pass] engine: ' + name + '\n');
};
await check('JSON plan maps calls, raw checks, step output and final output', async () => {
  const prepared = await prepareArtifact(
    artifact(
      [
        {
          id: 'map',
          call: { operation: 'identity' },
          input: { n: ref('$.input.n') },
          checks: [{ id: 'nonnegative', test: { $gte: [ref('$.value.n'), 0] } }],
          output: { $add: [ref('$.value.n'), 1] },
        },
      ],
      ref('$.steps.map.value'),
    ),
    registry,
  );
  assert.deepEqual(await prepared.run({ n: 2 }), { status: 'completed', value: 3, error: null });
  assert.equal((await prepared.run({ n: -1 })).status, 'failed');
});
await check(
  'no models: unavailable conditional, helper and unused helper calls rejected at preparation',
  async () => {
    const bad = { id: 'model', call: { operation: 'model' }, input: {}, when: false };
    for (const document of [
      artifact([bad]),
      artifact([], null, [{ id: 'helper', revision: 1, flow: flow([bad]) }]),
      artifact([{ id: 'helper', call: { flow: { id: 'missing', revision: 1 } }, input: {} }]),
    ]) {
      await assert.rejects(prepareArtifact(document, registry), /Unavailable/);
    }
  },
);
await check(
  'artifact, callbacks, schemas and mutable run input owned before awaits; concurrent runs independent',
  async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const definition = {
      input: z.unknown(),
      output: z.unknown(),
      run: async (input: unknown): Promise<unknown> => {
        await gate;
        return input;
      },
    };
    const operations = { identity: defineOperation(definition) };
    const document = artifact(
      [{ id: 'x', call: { operation: 'identity' }, input: ref('$.input') }],
      ref('$.steps.x.value'),
    );
    const preparing = prepareArtifact(document, operations);
    document.flow.steps.length = 0;
    definition.run = async (): Promise<unknown> => 'changed';
    operations.identity = native(() => 'replacement');
    const prepared = await preparing,
      input = { n: 1 };
    const first = prepared.run(input);
    input.n = 99;
    const second = prepared.run({ n: 2 });
    release();
    assert.equal((await first).value && JSON.stringify((await first).value), '{"n":1}');
    assert.deepEqual((await second).value, { n: 2 });
  },
);
await check('each preserves order, record mode exposes ordinary failures and skips', async () => {
  const operation = native((input: unknown): unknown => {
    if (input === 2) throw new OperationFailure('EXPECTED', 'Two failed');
    return input;
  });
  const prepared = await prepareArtifact(
    artifact(
      [
        {
          id: 'list',
          call: { operation: 'identity' },
          each: { items: ref('$.input'), onFailure: 'record' },
          input: ref('$.item'),
          when: { $neq: [ref('$.item'), 3] },
        },
      ],
      ref('$.steps.list.value'),
    ),
    { identity: operation },
  );
  assert.deepEqual((await prepared.run([1, 2, 3])).value, [
    { status: 'completed', value: 1, error: null },
    { status: 'failed', value: null, error: { code: 'EXPECTED', message: 'Two failed' } },
    { status: 'skipped', value: null, error: null },
  ]);
  const stop = await prepareArtifact(
    artifact([
      {
        id: 'list',
        call: { operation: 'identity' },
        each: { items: ref('$.input'), onFailure: 'stop' },
        input: ref('$.item'),
      },
    ]),
    { identity: operation },
  );
  assert.equal((await stop.run([1, 2])).status, 'failed');
});
await check('exact helper revision reused with separate scopes', async () => {
  const prepared = await prepareArtifact(
    artifact(
      [
        {
          id: 'list',
          call: { flow: { id: 'increment', revision: 1 } },
          each: { items: ref('$.input'), onFailure: 'stop' },
          input: ref('$.item'),
        },
      ],
      ref('$.steps.list.value'),
      [{ id: 'increment', revision: 1, flow: flow([], { $add: [ref('$.input'), 1] }) }],
    ),
    registry,
  );
  assert.deepEqual((await prepared.run([1, 2])).value, [
    { status: 'completed', value: 2, error: null },
    { status: 'completed', value: 3, error: null },
  ]);
});
await check('host depth, step and aggregate item limits stop execution', async () => {
  const each = artifact([
    {
      id: 'list',
      call: { operation: 'identity' },
      each: { items: ref('$.input'), onFailure: 'record' },
      input: ref('$.item'),
    },
  ]);
  await assert.rejects(
    (await prepareArtifact(each, registry, { maxItems: 1 })).run([1, 2]),
    (error) => error instanceof RunControl && error.code === 'ITEMS',
  );
  await assert.rejects(
    (await prepareArtifact(each, registry, { maxSteps: 1 })).run([1, 2]),
    (error) => error instanceof RunControl && error.code === 'STEPS',
  );
  const empty = artifact(
    [1, 2, 3, 4].map((id) => ({
      id: String(id),
      call: { operation: 'identity' },
      each: { items: [], onFailure: 'stop' },
      input: null,
    })),
  );
  await assert.rejects(
    (await prepareArtifact(empty, registry, { maxSteps: 1 })).run(null),
    (error) => error instanceof RunControl && error.code === 'STEPS',
  );
  const recursive = {
    id: 'recur',
    revision: 1,
    flow: flow([
      { id: 'again', call: { flow: { id: 'recur', revision: 1 } }, input: ref('$.input') },
    ]),
  };
  const plan = artifact(
    [{ id: 'start', call: { flow: { id: 'recur', revision: 1 } }, input: ref('$.input') }],
    null,
    [recursive],
  );
  await assert.rejects(
    (await prepareArtifact(plan, registry, { maxDepth: 2 })).run(null),
    (error) => error instanceof RunControl && error.code === 'DEPTH',
  );
});
await check(
  'cancellation and deadline reject uncooperative asynchronous operations without late publication',
  async () => {
    let starts = 0;
    const op = native(async (): Promise<unknown> => {
      starts++;
      await delay(80);
      return 'late';
    });
    const plan = artifact(
      [{ id: 'wait', call: { operation: 'wait' }, input: {} }],
      ref('$.steps.wait.value'),
    );
    const prepared = await prepareArtifact(plan, { wait: op }, { maxActiveMs: 20 });
    await assert.rejects(
      prepared.run(null),
      (error) => error instanceof RunControl && error.code === 'DEADLINE',
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      prepared.run(null, { signal: controller.signal }),
      (error) => error instanceof RunControl && error.code === 'CANCELLED',
    );
    assert.equal(starts, 1);
    await delay(85);
  },
);
await check(
  'invalid boundary values, nonboolean guards and unexpected adapter errors stay terminal in record mode',
  async () => {
    const plan = artifact([
      {
        id: 'list',
        call: { operation: 'bad' },
        each: { items: [1], onFailure: 'record' },
        input: ref('$.item'),
      },
    ]);
    await assert.rejects(
      (await prepareArtifact(plan, { bad: native(() => ({ n: Infinity })) })).run(null),
      ArtifactError,
    );
    await assert.rejects(
      (
        await prepareArtifact(plan, {
          bad: native(() => {
            throw new Error('bug');
          }),
        })
      ).run(null),
      /bug/,
    );
    const nonboolean = artifact([{ id: 'x', call: { operation: 'identity' }, when: 1, input: {} }]);
    await assert.rejects((await prepareArtifact(nonboolean, registry)).run(null), /boolean/);
  },
);
await check(
  'declared native and flow schemas enforced, malformed schemas rejected before execution',
  async () => {
    const plan = artifact(
      [{ id: 'x', call: { operation: 'identity' }, input: ref('$.input') }],
      ref('$.steps.x.value'),
    );
    const prepared = await prepareArtifact(plan, {
      identity: native((input) => input, z.number().int()),
    });
    await assert.rejects(prepared.run('wrong'), z.ZodError);
    const invalid = artifact();
    invalid.flow.inputSchema = { unknownSchemaKeyword: true };
    await assert.rejects(prepareArtifact(invalid, registry), /boundary schema/);
    const wrongOutput = { ...plan, flow: { ...plan.flow, outputSchema: { type: 'integer' } } };
    await assert.rejects((await prepareArtifact(wrongOutput, registry)).run('wrong'), /integer/);
  },
);
await check(
  'duplicate identities, malformed JSON, prototype keys and too-new Strata stamps',
  async () => {
    const step = { id: 'same', call: { operation: 'identity' }, input: {} };
    await assert.rejects(prepareArtifact(artifact([step, step]), registry), /Duplicate step/);
    await assert.rejects(
      prepareArtifact({ ...artifact(), stamp: { ...stamp, 'eden.engine': 999 } }, registry),
      /newer|ahead|version/i,
    );
    await assert.rejects(
      prepareArtifact(artifact([], { unknown: undefined }), registry),
      ArtifactError,
    );
    await assert.rejects(
      prepareArtifact({ ...artifact(), flows: null }, registry),
      /Invalid artifact/,
    );
    const proto = await prepareArtifact(
      artifact(
        [{ id: '__proto__', call: { operation: 'identity' }, input: 7 }],
        ref('$.steps.__proto__.value'),
      ),
      registry,
    );
    assert.equal((await proto.run(null)).value, 7);
    const hostile = artifact();
    hostile.flow.inputSchema = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"integer"}}}',
    );
    await assert.rejects(prepareArtifact(hostile, registry), /__proto__/);
  },
);
await check(
  'unsupported Prism configuration keys refused before effects; ordinary source keys survive',
  async () => {
    let calls = 0;
    const operation = native((): null => {
      calls++;
      return null;
    });
    const literal: unknown = JSON.parse('{"nested":{"__proto__":{"n":1},"a":2}}');
    const plan = artifact([{ id: 'effect', call: { operation: 'effect' }, input: {} }], {
      $const: literal,
    });
    await assert.rejects(
      prepareArtifact(plan, { effect: operation }),
      (error) => error instanceof ArtifactError && error.code === 'INVALID_EXPRESSION',
    );
    assert.equal(calls, 0);
    const input: unknown = JSON.parse('{"__proto__":{"n":1},"a":2}');
    assert.equal(
      JSON.stringify((await (await prepareArtifact(artifact(), registry)).run(input)).value),
      JSON.stringify(input),
    );
  },
);
await check(
  'Prism limits remain finite and host-configurable for larger source values',
  async () => {
    const input = 'x'.repeat(65);
    await assert.rejects(
      (await prepareArtifact(artifact(), registry, { prism: { maxStringLength: 64 } })).run(input),
      (error) => error instanceof Error && 'code' in error && error.code === 'E_BUDGET',
    );
    const prepared = await prepareArtifact(artifact(), registry, {
      prism: { maxStringLength: 128 },
    });
    assert.equal((await prepared.run(input)).value, input);
    await assert.rejects(
      prepareArtifact(artifact(), registry, { prism: { maxStringLength: Infinity } }),
    );
  },
);
await check('native validation has one owner for direct and interpreted calls', async () => {
  let inputChecks = 0;
  let outputChecks = 0;
  const operation = defineOperation({
    input: z.number().superRefine(() => {
      inputChecks++;
    }),
    output: z.number().superRefine(() => {
      outputChecks++;
    }),
    run: (value) => value + 1,
  });
  assert.equal(await operation.run(1, { signal: new AbortController().signal }), 2);
  assert.equal(inputChecks, 1);
  assert.equal(outputChecks, 1);
  const plan = artifact(
    [{ id: 'x', call: { operation: 'increment' }, input: ref('$.input') }],
    ref('$.steps.x.value'),
  );
  const prepared = await prepareArtifact(plan, { increment: operation });
  assert.equal(inputChecks, 1);
  assert.equal((await prepared.run(2)).value, 3);
  assert.equal(inputChecks, 2);
  assert.equal(outputChecks, 2);
  await assert.rejects(operation.run('bad', { signal: new AbortController().signal }), z.ZodError);
  const invalid = defineOperation({ input: z.unknown(), output: z.number(), run: () => 'bad' });
  await assert.rejects(invalid.run(null, { signal: new AbortController().signal }), z.ZodError);
  const object: unknown = JSON.parse('{"__proto__":{"n":1},"a":2}');
  const preserve = defineOperation({
    input: z.unknown(),
    output: z.record(z.string(), z.unknown()),
    run: () => object,
  });
  assert.equal(
    JSON.stringify(await preserve.run(null, { signal: new AbortController().signal })),
    JSON.stringify(object),
  );
});
await check(
  'results contain only executed steps; unavailable references fail before calls',
  async () => {
    let calls = 0;
    const operation = native(() => {
      calls++;
      return null;
    });
    const forward = artifact([
      { id: 'first', call: { operation: 'effect' }, input: ref('$.steps.later.value') },
      { id: 'later', call: { operation: 'effect' }, input: null },
    ]);
    await assert.rejects((await prepareArtifact(forward, { effect: operation })).run(null));
    assert.equal(calls, 0);
    const observed = artifact(
      [
        { id: 'before', call: { operation: 'identity' }, input: { $keys: ref('$.steps') } },
        { id: 'after', call: { operation: 'identity' }, input: { $keys: ref('$.steps') } },
      ],
      { before: ref('$.steps.before.value'), after: ref('$.steps.after.value') },
    );
    assert.deepEqual((await (await prepareArtifact(observed, registry)).run(null)).value, {
      before: [],
      after: ['before'],
    });
  },
);
process.stdout.write('Engine: ' + passed + ' behavior groups passed.\n');

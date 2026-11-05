import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineOperation, prepareArtifact } from '../src/index.js';
import { createDiscoveryOperations, discoveryWorkflow } from '../src/discovery/index.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import type { JsonValue, Operation } from '../src/engine/contracts.js';

// Observe real producer-to-consumer boundaries; no replacement source implementation.
const url = 'https://ownership.invalid/records';
const web = createWebOperations();
const http = web.operations['http.get'];
assert(http);
const mechanical = {
  'http.get': {
    ...http,
    async run(): Promise<JsonValue> {
      const body = captureBody(Buffer.from('<main><article>Alpha</article></main>'));
      return {
        url,
        status: 200,
        headers: { 'content-type': ['text/html'] },
        body,
        encoded: body,
      };
    },
  },
};
const discovery = createDiscoveryOperations({
  author: { apiKey: 'unused-offline' },
  mechanical,
});
const observed = new Map<string, { input?: JsonValue; output?: JsonValue }>();
const registry: Record<string, Operation> = {
  ...discovery.operations,
  'test.observe': defineOperation({
    input: z
      .object({ id: z.string(), phase: z.enum(['input', 'output']), value: z.json() })
      .strict(),
    output: z.json(),
    run({ id, phase, value }) {
      observed.set(id, { ...observed.get(id), [phase]: value });
      return value;
    },
  }),
};
const decisions: Record<string, JsonValue> = {
  'task.declare': { requiresNavigation: false, resultFlow: null },
  'author.html': {
    action: 'propose',
    candidate: { selector: 'article', fields: null, links: null, result: null },
  },
  'author.output': { $pluck: { over: { $ref: '$.input.records' }, key: 'text' } },
  'result.review': { accepted: true, reason: 'Controlled ownership check.' },
};
for (const [name, decision] of Object.entries(decisions)) {
  const operation = discovery.operations[name];
  assert(operation);
  registry[name] = {
    ...operation,
    async run(): Promise<JsonValue> {
      return {
        ok: true,
        decision,
        error: null,
        meta: {
          steps: 1,
          elapsedMs: 1,
          outputRetries: 0,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false },
        },
        rawSources: [],
      };
    },
  };
}
const ids = [
  'traverse',
  'acquire-phase',
  'build-source',
  'source-request',
  'test-source',
  'advance-phase',
];
const originals = discoveryWorkflow.flows.filter((entry) => ids.includes(entry.id));
assert.equal(originals.length, ids.length);
const workflow = {
  ...discoveryWorkflow,
  flows: [
    ...discoveryWorkflow.flows.map((entry) =>
      !ids.includes(entry.id)
        ? entry
        : {
            ...entry,
            flow: {
              ...entry.flow,
              steps: [
                {
                  id: 'input',
                  call: { operation: 'test.observe' },
                  input: { id: entry.id, phase: 'input', value: { $ref: '$.input' } },
                },
                {
                  id: 'actual',
                  call: { flow: { id: 'observed-' + entry.id, revision: entry.revision } },
                  input: { $ref: '$.input' },
                },
                {
                  id: 'output',
                  call: { operation: 'test.observe' },
                  input: { id: entry.id, phase: 'output', value: { $ref: '$.steps.actual.value' } },
                },
              ],
              output: { $ref: '$.steps.actual.value' },
            },
          },
    ),
    ...originals.map((entry) => ({ ...entry, id: 'observed-' + entry.id })),
  ],
};
try {
  const request = {
    url,
    instruction: 'Return the article labels.',
    outputSchema: { type: 'array', items: { type: 'string' } },
  };
  const unchanged = await (
    await prepareArtifact(discoveryWorkflow, registry, discovery.limits)
  ).run(request);
  const actual = await (await prepareArtifact(workflow, registry, discovery.limits)).run(request);
  assert.deepEqual(actual, unchanged, 'Observing boundaries must preserve the public result');
  assert.equal(actual.status, 'completed');
  assert.equal(z.object({ status: z.string() }).parse(actual.value).status, 'ready');

  let effects = 0;
  const effect = defineOperation({
    input: z.null(),
    output: z.null(),
    run() {
      effects++;
      return null;
    },
  });
  const record = z.record(z.string(), z.json());
  const ownedOutputKeys: Record<string, string[]> = {
    'build-source': ['level', 'part', 'feedback', 'allowance', 'histories', 'reason'],
    'acquire-phase': ['acquisition', 'owned', 'level', 'processed', 'focus', 'feedback', 'reason'],
    'advance-phase': ['hasNext', 'depth', 'frontier'],
    traverse: [
      'acquisition',
      'owned',
      'levels',
      'frontier',
      'processed',
      'depth',
      'focus',
      'allowance',
      'histories',
      'feedback',
      'reason',
      'hasNext',
    ],
  };
  for (const entry of originals) {
    const sample = observed.get(entry.id);
    assert(sample?.input, entry.id + ' must be reached by the real pipeline');
    const input = record.parse(sample.input);
    const ownedKeys = ownedOutputKeys[entry.id];
    if (ownedKeys)
      assert.deepEqual(
        Object.keys(record.parse(sample.output)).sort(),
        [...ownedKeys].sort(),
        entry.id + ' returned fields it does not own',
      );
    const probe = await prepareArtifact(
      {
        stamp: discoveryWorkflow.stamp,
        flow: {
          inputSchema: entry.flow.inputSchema,
          outputSchema: {},
          steps: [{ id: 'effect', call: { operation: 'effect' }, input: null }],
          output: null,
        },
      },
      { effect },
    );
    await probe.run(input);
    const before = effects;
    const foreign =
      entry.id === 'build-source' || entry.id === 'source-request' || entry.id === 'test-source'
        ? ['acquisition', 'levels', 'fixed', 'budget', 'lastWorking', 'review', 'artifact']
        : ['lastWorking', 'review', 'artifact', 'capturedTrial', 'partialTrial', 'published'];
    for (const key of foreign) {
      assert(!Object.hasOwn(input, key), entry.id + ' unexpectedly owns ' + key);
      await assert.rejects(probe.run({ ...input, [key]: {} }), { code: 'INVALID_VALUE' });
      assert.equal(effects, before, 'Foreign state reached effect: ' + entry.id + '/' + key);
    }
    if (entry.id === 'traverse') {
      const fixed = record.parse(input.fixed);
      const profile = record.parse(fixed.profile);
      await assert.rejects(
        probe.run({ ...input, fixed: { ...fixed, profile: { ...profile, review: {} } } }),
        { code: 'INVALID_VALUE' },
      );
      assert.equal(effects, before);
    }
    if (entry.id === 'advance-phase') {
      const captures = z
        .array(
          z
            .object({
              source: z.object({ url: z.string() }).strict().nullable(),
              redirects: z.array(z.object({ url: z.string() }).strict()),
            })
            .strict(),
        )
        .parse(input.captures);
      assert(captures[0]?.source);
      await assert.rejects(
        probe.run({
          ...input,
          captures: [{ ...captures[0], source: { ...captures[0].source, body: {} } }],
        }),
        { code: 'INVALID_VALUE' },
      );
      assert.equal(effects, before, 'Advance must not accept unused response bodies');
    }
  }

  const source = originals.find((entry) => entry.id === 'build-source');
  const sourceOutput = record.parse(observed.get('build-source')?.output);
  assert(source);
  const level = record.parse(sourceOutput.level);
  assert.equal(level.ready, true);
  let consumers = 0;
  const producer = async (output: JsonValue) => {
    const plan = await prepareArtifact(
      {
        stamp: discoveryWorkflow.stamp,
        flow: {
          inputSchema: { type: 'null' },
          outputSchema: {},
          steps: [
            { id: 'source', call: { flow: { id: 'source', revision: 1 } }, input: null },
            { id: 'consumer', call: { operation: 'consume' }, input: null },
          ],
          output: null,
        },
        flows: [
          {
            id: 'source',
            revision: 1,
            flow: {
              inputSchema: { type: 'null' },
              outputSchema: source.flow.outputSchema,
              steps: [],
              output: { $const: output },
            },
          },
        ],
      },
      {
        consume: defineOperation({
          input: z.null(),
          output: z.null(),
          run() {
            consumers++;
            return null;
          },
        }),
      },
    );
    await plan.run(null);
  };
  await producer(sourceOutput);
  assert.equal(consumers, 1);
  for (const malformed of [
    { ...sourceOutput, level: { ...level, ready: false } },
    { ...sourceOutput, levels: [] },
    { ...sourceOutput, budget: { review: { steps: 99, ms: 99 } } },
  ]) {
    await assert.rejects(producer(malformed), { code: 'INVALID_VALUE' });
    assert.equal(consumers, 1);
  }
  console.log(
    '[pass] source ownership: six real boundaries reject foreign root/reviewer/output state before effects; scoped success cannot publish a draft or overwrite traversal/reviewer ownership',
  );
} finally {
  discovery.close();
  web.close();
}

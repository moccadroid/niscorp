import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineOperation, prepareArtifact } from '../src/index.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { DiscoveryResultSchema } from '../src/discovery/discovery-result.schema.js';
import { captureBody } from '../src/operations/http-source.js';
import { createWebOperations } from '../src/operations/index.js';
import type { Artifact } from '../src/engine/schema.js';
import type { JsonValue, Operation } from '../src/engine/contracts.js';
import { blueprint, builderContracts } from '../src/discovery/blueprint.js';

export const localOutputCases = [
  'supplied',
  'generated',
  'schema-repair',
  'mapping-repair',
  'repair-failure',
  'exhausted',
  'limited-exhausted',
  'null-program',
] as const;
type Scenario = (typeof localOutputCases)[number];

/** Controlled responses prove orchestration/ownership, not model accuracy. */
export const runOutputScenario = async (
  scenario: Scenario,
  implementation: {
    workflow: Artifact;
    createOperations: typeof createDiscoveryOperations;
  } = { workflow: discoveryWorkflow, createOperations: createDiscoveryOperations },
): Promise<{
  result: z.output<typeof DiscoveryResultSchema>;
  events: { operation: string; input: unknown }[];
  requests: number;
  outputs: unknown[];
  counts: Record<string, number>;
}> => {
  const profile = structuredClone(discoveryProfile);
  if (scenario === 'exhausted' || scenario === 'limited-exhausted')
    profile.author.maxModelSteps = 2;
  const url = 'https://local-output.invalid/records';
  let html = '<main><article>Alpha</article><article>Beta</article></main>';
  if (scenario === 'limited-exhausted') html += '<a href="/more">More</a>';
  let requests = 0;
  const events: { operation: string; input: unknown }[] = [];
  const counts = new Map<string, number>();
  const runtime = createWebOperations();
  const originalGet = runtime.operations['http.get'];
  assert(originalGet);
  const mechanical = {
    'http.get': {
      ...originalGet,
      async run(input: unknown): Promise<JsonValue> {
        assert.equal(z.object({ url: z.string() }).parse(input).url, url);
        requests++;
        const body = captureBody(Buffer.from(html));
        return {
          url,
          status: 200,
          headers: { 'content-type': ['text/html'] },
          encoded: body,
          body,
        };
      },
    },
  };
  const operations = implementation.createOperations({
    author: { apiKey: 'unused-offline' },
    profile,
    mechanical,
  });
  const registry: Record<string, Operation> = { ...operations.operations };
  const models = [
    'task.declare',
    'author.html',
    'result.contract',
    'author.output',
    'result.review',
  ];
  for (const name of models) {
    const native = operations.operations[name];
    assert(native);
    registry[name] = {
      ...native,
      async run(input: unknown): Promise<JsonValue> {
        const index = (counts.get(name) ?? 0) + 1;
        counts.set(name, index);
        events.push({ operation: name, input: structuredClone(input) });
        let decision: JsonValue;
        let failed = false;
        switch (name) {
          case 'task.declare':
            decision = { requiresNavigation: scenario === 'limited-exhausted', resultFlow: null };
            break;
          case 'author.html':
            failed = scenario === 'repair-failure' && index > 1;
            decision = {
              action: 'propose',
              candidate: {
                selector: 'article',
                fields: null,
                links: scenario === 'limited-exhausted' ? 'a' : null,
                result: null,
              },
            };
            break;
          case 'result.contract':
            decision = {
              type: 'array',
              items: { type: scenario === 'schema-repair' && index === 1 ? 'float' : 'string' },
            };
            break;
          case 'author.output':
            decision =
              scenario === 'null-program'
                ? null
                : scenario === 'mapping-repair' && index === 1
                  ? { $ref: '$.input.missing' }
                  : { $pluck: { over: { $ref: '$.input.records' }, key: 'text' } };
            break;
          default:
            decision = {
              accepted: scenario !== 'repair-failure',
              reason: 'Controlled review verdict.',
            };
        }
        return {
          ok: !failed,
          decision: failed ? null : decision,
          error: failed ? { code: 'MODEL_FIXTURE', message: 'Controlled source failure.' } : null,
          meta: {
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, reported: true },
            strategy: 'emit',
            steps: 1,
            outputRetries: 0,
            elapsedMs: 1,
          },
          rawSources: [],
        };
      },
    };
  }
  try {
    const workflow = await prepareArtifact(implementation.workflow, registry, operations.limits);
    const generated = scenario === 'generated' || scenario === 'schema-repair';
    const outcome = await workflow.run({
      url,
      instruction:
        scenario === 'limited-exhausted'
          ? 'Follow links and return all labels.'
          : 'Return all labels.',
      ...(!generated && {
        outputSchema:
          scenario === 'null-program'
            ? { type: 'null' }
            : { type: 'array', items: { type: 'string' } },
      }),
      allowLinkFollowing: scenario === 'limited-exhausted',
      linkDepth: scenario === 'limited-exhausted' ? 1 : 0,
      maxPages: 1,
    });
    assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
    const result = DiscoveryResultSchema.parse(outcome.value);
    const outputs: unknown[] = [];
    if (result.artifact) {
      const modelsBefore = events.length;
      const replay = await prepareArtifact(result.artifact, {
        ...runtime.operations,
        ...mechanical,
      });
      const read = async (): Promise<void> => {
        const value = await replay.run({ url });
        assert.equal(value.status, 'completed', JSON.stringify(value));
        outputs.push(value.value);
      };
      await read();
      if (scenario === 'supplied') {
        html =
          '<main><article>Gamma</article><article>Delta</article><article>Epsilon</article></main>';
        await read();
        html = '<main></main>';
        await read();
        assert.deepEqual(
          outputs.map((v) => z.object({ data: z.json() }).parse(v).data),
          [['Alpha', 'Beta'], ['Gamma', 'Delta', 'Epsilon'], []],
        );
      }
      assert.equal(events.length, modelsBefore);
    }
    return { result, events, requests, outputs, counts: Object.fromEntries(counts) };
  } finally {
    operations.close();
    runtime.close();
  }
};

for (const scenario of localOutputCases) {
  const actual = await runOutputScenario(scenario);
  for (const event of actual.events) {
    const settings = z
      .object({ settings: z.object({ reasoningEffort: z.string() }) })
      .parse(event.input).settings;
    assert.equal(settings.reasoningEffort, event.operation === 'author.output' ? 'low' : 'high');
  }
  if (scenario === 'exhausted' || scenario === 'limited-exhausted') {
    assert.equal(actual.result.status, 'unresolved');
    assert.match(actual.result.reason ?? '', /allowance exhausted/i);
    assert.equal(actual.counts['author.output'] ?? 0, 0);
    assert.equal(actual.result.author.remaining.author.steps, 0);
    assert.equal(actual.result.limited, scenario === 'limited-exhausted');
  } else {
    assert.equal(actual.result.status, 'ready');
    assert(actual.result.trial?.value && typeof actual.result.trial.value === 'object');
    assert.deepEqual(
      z.object({ data: z.json() }).parse(actual.result.trial.value).data,
      scenario === 'null-program' ? null : ['Alpha', 'Beta'],
    );
    if (scenario === 'repair-failure') {
      assert.equal(actual.result.review?.decision?.accepted, false);
      assert.equal(actual.result.repair.attempts, 1);
      assert.match(actual.result.repair.reason ?? '', /Controlled source failure/);
      assert.equal(
        actual.result.author.remaining.author.steps,
        discoveryProfile.author.maxModelSteps - 1,
      );
      assert.equal(actual.counts['author.output'], 1);
    }
    if (scenario === 'schema-repair') assert.equal(actual.counts['result.contract'], 2);
    if (scenario === 'mapping-repair') {
      assert.equal(actual.counts['author.output'], 2);
      const request = actual.events.filter((event) => event.operation === 'author.output')[1];
      assert(request);
      const messages = z
        .object({ messages: z.array(z.object({ content: z.string() })) })
        .parse(request.input).messages;
      const feedback = messages.find((message) =>
        message.content.startsWith('CURRENT MAPPING FEEDBACK\n'),
      );
      assert(feedback);
      assert.match(feedback.content, /"op":"\$ref"/);
      assert.match(feedback.content, /"path":"\$\.input\.missing"/);
      assert(Buffer.byteLength(feedback.content) < discoveryProfile.maxInputBytes);
    }
  }
  console.log(`[pass] local output ownership: ${scenario}`);
}

for (const outputSettings of [{ reasoningEffort: 'high' as const }, undefined]) {
  const result = await runOutputScenario('supplied', {
    workflow: discoveryWorkflow,
    createOperations(input) {
      const profile = structuredClone(discoveryProfile);
      if (outputSettings) profile.outputSettings = outputSettings;
      else delete profile.outputSettings;
      return createDiscoveryOperations({ ...input, profile });
    },
  });
  const output = result.events.find((event) => event.operation === 'author.output');
  assert(output);
  assert.equal(
    z.object({ settings: z.object({ reasoningEffort: z.string() }) }).parse(output.input).settings
      .reasoningEffort,
    'high',
  );
}
console.log(
  '[pass] output settings: default low only for output mapping; explicit overrides and legacy profiles preserve base settings',
);

for (const test of [
  {
    name: 'tighter',
    caps: { maxSteps: 1, outputAttempts: 1, maxMs: 10 },
    steps: 1,
    attempts: 1,
    ms: 10,
  },
  {
    name: 'equal',
    caps: { maxSteps: 3, outputAttempts: 3, maxMs: 300000 },
    steps: 3,
    attempts: 3,
    ms: 299998,
  },
  {
    name: 'looser',
    caps: { maxSteps: 99, outputAttempts: 99, maxMs: 600000 },
    steps: 3,
    attempts: 3,
    ms: 299998,
  },
  { name: 'omitted', caps: {}, steps: 3, attempts: 3, ms: 299998 },
  {
    name: 'remaining',
    caps: { maxSteps: 99, outputAttempts: 99, maxMs: 600000 },
    steps: 1,
    attempts: 1,
    ms: 18,
    authorSteps: 3,
    authorMs: 20,
  },
] as const) {
  const actual = await runOutputScenario('supplied', {
    workflow: discoveryWorkflow,
    createOperations(input) {
      const profile = structuredClone(discoveryProfile);
      profile.outputSettings = { reasoningEffort: 'low', ...test.caps };
      if (test.authorSteps !== undefined) profile.author.maxModelSteps = test.authorSteps;
      if (test.authorMs !== undefined) profile.author.maxModelMs = test.authorMs;
      return createDiscoveryOperations({ ...input, profile });
    },
  });
  assert.equal(actual.result.status, 'ready');
  const request = actual.events.find((event) => event.operation === 'author.output');
  assert(request);
  const settings = z
    .object({
      settings: z.object({
        maxSteps: z.number(),
        outputAttempts: z.number(),
        maxMs: z.number(),
      }),
    })
    .parse(request.input).settings;
  assert.deepEqual(
    settings,
    { maxSteps: test.steps, outputAttempts: test.attempts, maxMs: test.ms },
    test.name,
  );
}

for (const key of ['maxSteps', 'outputAttempts', 'maxMs'] as const) {
  for (const value of [0, -1, 1.5, '1']) {
    assert.throws(
      () =>
        createDiscoveryOperations({
          author: { apiKey: 'unused-offline' },
          profile: { ...discoveryProfile, outputSettings: { [key]: value } },
        }),
      `${key}=${String(value)} must fail profile admission`,
    );
  }
}
const repairedWithCaps = await runOutputScenario('mapping-repair', {
  workflow: discoveryWorkflow,
  createOperations(input) {
    const profile = structuredClone(discoveryProfile);
    profile.outputSettings = { maxSteps: 1, outputAttempts: 1, maxMs: 10 };
    return createDiscoveryOperations({ ...input, profile });
  },
});
assert.equal(repairedWithCaps.result.status, 'ready');
const mappingRequests = repairedWithCaps.events.filter(
  (event) => event.operation === 'author.output',
);
assert.equal(mappingRequests.length, 2);
for (const request of mappingRequests) {
  const settings = z
    .object({
      settings: z.object({
        maxSteps: z.number(),
        outputAttempts: z.number(),
        maxMs: z.number(),
      }),
    })
    .parse(request.input).settings;
  assert.deepEqual(settings, { maxSteps: 1, outputAttempts: 1, maxMs: 10 });
}
assert.equal(
  repairedWithCaps.result.author.remaining.author.steps,
  discoveryProfile.author.maxModelSteps - 4,
);
console.log(
  '[pass] output settings: tighter/equal/looser/omitted bounds respect phase and remaining allowances; invalid bounds fail admission',
);

const commonJob = {
  instruction: 'Return all labels.',
  asOf: null,
  sourceData: { records: [] },
  settings: discoveryProfile.settings,
  responseAttempts: discoveryProfile.author.maxResponseAttempts,
  maxInputBytes: discoveryProfile.maxInputBytes,
  allowance: { steps: 2, ms: 1000 },
  histories: [],
  repairFeedback: null,
  repairCount: 0,
  feedback: null,
};
const observation = {
  sourceArtifact: {},
  sourceFlow: { id: 'output-source', revision: 1 },
  shapedFlow: blueprint.execution.shaped,
  mapping: null,
  schema: { type: 'null' },
  url: 'https://local-output.invalid/records',
  captures: [],
  partialTrial: null,
};
const { mapping: _mapping, ...mappingInput } = observation;
void _mapping;
for (const [name, input] of [
  ['declare-contract', { ...commonJob, stamp: discoveryWorkflow.stamp }],
  ['build-output', { ...commonJob, ...mappingInput }],
  ['observe-output', observation],
] as const) {
  const contract = builderContracts[name];
  assert(contract);
  let effects = 0;
  const probe = await prepareArtifact(
    {
      stamp: discoveryWorkflow.stamp,
      flow: {
        inputSchema: contract.inputSchema,
        outputSchema: {},
        steps: [{ id: 'effect', call: { operation: 'effect' }, input: null }],
        output: null,
      },
    },
    {
      effect: defineOperation({
        input: z.null(),
        output: z.null(),
        run: () => {
          effects++;
          return null;
        },
      }),
    },
  );
  assert.equal((await probe.run(input)).status, 'completed');
  assert.equal(effects, 1);
  for (const foreign of [{ fixed: {} }, { acquisition: { sources: [] } }]) {
    await assert.rejects(probe.run({ ...input, ...foreign }), { code: 'INVALID_VALUE' });
    assert.equal(effects, 1);
  }
}
console.log(
  '[pass] local output ownership: three admitted leaf inputs reject outer working state before effects',
);

const jobOutcome = {
  allowance: { steps: 1, ms: 1000 },
  histories: [],
  feedback: null,
  reason: null,
};
const complete = {
  id: 'captured',
  status: 'completed',
  value: { data: null },
  error: null,
};
const mappedOutcome = {
  ...jobOutcome,
  mapping: null,
  partialTrial: null,
  artifact: {},
  capturedTrial: complete,
};
for (const [name, good, malformed] of [
  [
    'declare-contract',
    { ...jobOutcome, schema: { type: 'null' } },
    [{ ...jobOutcome, schema: null }],
  ],
  [
    'build-output',
    mappedOutcome,
    [
      { ...mappedOutcome, artifact: null },
      { ...mappedOutcome, capturedTrial: null },
      {
        ...mappedOutcome,
        capturedTrial: {
          ...complete,
          status: 'failed',
          value: null,
          error: { code: 'TRIAL_FAILED', message: 'Controlled trial failure.' },
        },
      },
    ],
  ],
] as const) {
  const contract = builderContracts[name];
  assert(contract);
  let consumers = 0;
  const runProducer = async (produced: unknown): Promise<void> => {
    const prepared = await prepareArtifact(
      {
        stamp: discoveryWorkflow.stamp,
        flow: {
          inputSchema: { type: 'null' },
          outputSchema: {},
          steps: [
            { id: 'producer', call: { flow: { id: 'producer', revision: 1 } }, input: null },
            { id: 'consumer', call: { operation: 'consumer' }, input: null },
          ],
          output: null,
        },
        flows: [
          {
            id: 'producer',
            revision: 1,
            flow: {
              inputSchema: { type: 'null' },
              outputSchema: contract.outputSchema,
              steps: [],
              output: { $const: produced },
            },
          },
        ],
      },
      {
        consumer: defineOperation({
          input: z.null(),
          output: z.null(),
          run: () => {
            consumers++;
            return null;
          },
        }),
      },
    );
    await prepared.run(null);
  };
  await runProducer(good);
  assert.equal(consumers, 1);
  for (const bad of malformed) {
    await assert.rejects(runProducer(bad), { code: 'INVALID_VALUE' });
    assert.equal(consumers, 1);
  }
}
console.log(
  '[pass] local output ownership: final jobs reject malformed success before the next consumer; a null Prism mapping remains valid',
);

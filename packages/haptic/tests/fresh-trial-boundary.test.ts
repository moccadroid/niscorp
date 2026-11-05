import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact, defineOperation } from '../src/index.js';
import { discoveryProfile, discoveryWorkflow } from '../src/discovery/index.js';
import { createTrialOperation } from '../src/discovery/trial.js';

// Exercise the actual final mechanical boundary; this is not discovery-accuracy evidence.
let calls = 0;
let value = 1;
const read = defineOperation({
  input: z.object({ url: z.url() }).strict(),
  output: z.object({ data: z.number() }).strict(),
  run() {
    calls++;
    return { data: value };
  },
});
const artifact = {
  stamp: discoveryWorkflow.stamp,
  flow: {
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', format: 'uri' } },
      required: ['url'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { data: { type: 'number' } },
      required: ['data'],
      additionalProperties: false,
    },
    steps: [{ id: 'current', call: { operation: 'read' }, input: { $ref: '$.input' } }],
    output: { $ref: '$.steps.current.value' },
  },
};
const helper = discoveryWorkflow.flows.find((flow) => flow.id === 'fresh-phase');
assert(helper);
const prepared = await prepareArtifact(
  { stamp: discoveryWorkflow.stamp, flow: helper.flow },
  { 'artifact.trial': createTrialOperation({ read }, discoveryProfile.trial) },
);
const input = { url: 'https://boundary.invalid/current', artifact };
for (const extra of [{ budget: {} }, { fixed: {} }, { credentials: 'unrelated' }]) {
  await assert.rejects(prepared.run({ ...input, ...extra }));
}
assert.equal(calls, 0, 'Unrelated outer state is rejected before mechanical execution');
for (value of [1, 2]) {
  const result = await prepared.run(input);
  assert.equal(result.status, 'completed');
  const output = z
    .object({
      fresh: z.object({
        status: z.literal('completed'),
        value: z.object({ data: z.number() }),
        error: z.null(),
        id: z.string(),
      }),
      published: z.literal(true),
      reason: z.null(),
    })
    .strict()
    .parse(result.value);
  assert.equal(output.fresh.value.data, value);
}
assert.equal(calls, 2);
const invalid = await prepared.run({
  ...input,
  artifact: { ...artifact, flow: { ...artifact.flow, outputSchema: { type: 'string' } } },
});
assert.equal(invalid.status, 'completed');
const failure = z
  .object({
    fresh: z.object({
      status: z.literal('rejected'),
      value: z.null(),
      error: z.object({ code: z.string(), message: z.string() }),
      id: z.string(),
    }),
    published: z.literal(false),
    reason: z.string().min(1),
  })
  .strict()
  .parse(invalid.value);
assert.equal(failure.fresh.error.code, 'INVALID_VALUE');
console.log(
  '[pass] fresh boundary: only URL/artifact enter; current mechanical values and failure facts leave; no outer state or models',
);

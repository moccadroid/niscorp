import assert from 'node:assert/strict';
import { prepareArtifact } from '../src/index.js';
import { discoveryWorkflow } from '../src/discovery/index.js';

const entry = discoveryWorkflow.flows.find((flow) => flow.id === 'generated-schema');
assert(entry);
const normalizer = await prepareArtifact(
  { stamp: discoveryWorkflow.stamp, flow: entry.flow, flows: [entry] },
  {},
);
const schema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      nested: {
        type: 'object',
        properties: { amount: { type: 'number' } },
        required: ['amount'],
        additionalProperties: false,
      },
      records: {
        type: 'array',
        items: {
          type: 'object',
          properties: { flag: { type: 'boolean' } },
          required: ['flag'],
          additionalProperties: false,
        },
      },
      choice: {
        anyOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: { code: { type: 'integer' } },
            required: ['code'],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ['nested', 'records', 'choice'],
    additionalProperties: false,
  },
};
const input = { schema, nullable: false };
const before = structuredClone(input);
const normalized = await normalizer.run(input);
assert.equal(normalized.status, 'completed');
assert.deepEqual(input, before);
const check = await prepareArtifact(
  {
    stamp: discoveryWorkflow.stamp,
    flow: {
      inputSchema: {},
      outputSchema: normalized.value,
      steps: [],
      output: { $ref: '$.input' },
    },
  },
  {},
);
for (const value of [
  [],
  [{}],
  [{ nested: null, records: [{}], choice: {} }],
  [{ nested: { amount: null }, records: [{ flag: null }], choice: null }],
  [{ nested: { amount: 2 }, records: [{ flag: false }], choice: 'text' }],
]) {
  const result = await check.run(value);
  assert.equal(result.status, 'completed', JSON.stringify(result));
}
for (const value of [
  null,
  [null],
  [{ nested: { amount: 'wrong' } }],
  [{ records: [null] }],
  [{ choice: { code: 'wrong' } }],
  [{ extra: true }],
]) {
  await assert.rejects(check.run(value), { code: 'INVALID_VALUE' });
}
console.log(
  '[pass] best-effort schema: recursive optional/null object fields; original input, non-null types, array items and undeclared-field restrictions preserved',
);

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createSignal } from '@niscorp/signal';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import {
  discoveryProfile,
  discoveryWorkflow,
  ResultSchemaBodySchema,
} from '../src/discovery/index.js';
import { createResultContractOperation } from '../src/discovery/result-contract.js';
import { createJsonEncodingOperation, createReviewOperation } from '../src/discovery/review.js';
import { createTextBytesOperation } from '../src/discovery/source-author.js';
import { createHtmlViewOperation } from '../src/discovery/html-view.js';

const scalar = { type: 'string', description: 'Requested value.' };
const valid = [
  scalar,
  { type: 'null', description: 'Explicitly requested absence.' },
  { type: 'integer', description: 'Count.' },
  { type: 'array', description: 'Values.', items: scalar },
  {
    type: 'object',
    description: 'Requested record.',
    properties: { unrelatedName: scalar },
    required: [],
    additionalProperties: false,
  },
  {
    description: 'Optional value.',
    anyOf: [scalar, { type: 'null', description: 'Missing value.' }],
  },
];
const invalid = [
  null,
  {},
  { values: scalar },
  { ...scalar, $schema: 'http://json-schema.org/draft-07/schema#' },
  { ...scalar, $ref: '#/$defs/x' },
  { ...scalar, definitions: {} },
  { ...scalar, const: 'frozen value' },
  { type: 'array', description: 'Values.' },
  { type: 'object', description: 'Record.', properties: {} },
  { description: 'Alternatives.', anyOf: [] },
];
for (const value of valid) assert(ResultSchemaBodySchema.safeParse(value).success);
for (const value of invalid) assert(!ResultSchemaBodySchema.safeParse(value).success);
console.log(
  '[pass] result boundary: 6 ordinary dynamic schema controls and 10 invalid/free-form schema shapes',
);

const requests: { messages: { role: string; content: string }[] }[] = [];
let mode: 'contract' | 'review' = 'review';
const server = createServer(async (request, response) => {
  let body = '';
  for await (const part of request) body += part;
  const input = JSON.parse(body);
  requests.push(input);
  const data =
    mode === 'contract' && requests.length === 1
      ? { releases: scalar }
      : mode === 'contract'
        ? scalar
        : { accepted: true, reason: 'Controlled offline verdict; no semantic model evaluation.' };
  response.setHeader('content-type', 'text/event-stream');
  response.end(
    'data: ' +
      JSON.stringify({
        id: 'offline-boundary',
        choices: [
          { index: 0, delta: { content: JSON.stringify({ data }) }, finish_reason: 'stop' },
        ],
      }) +
      '\n\ndata: [DONE]\n\n',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const client = createSignal(
  { adapter: 'openai-compatible', baseUrl: 'http://127.0.0.1:' + address.port + '/v1' },
  { apiKey: 'offline' },
);
const review = discoveryWorkflow.flows?.find((flow) => flow.id === 'result-review');
assert(review);
try {
  const prepared = await prepareArtifact(
    {
      stamp: discoveryWorkflow.stamp,
      flow: review.flow,
      flows: discoveryWorkflow.flows?.filter((flow) =>
        [
          'review-evidence',
          'review-turn',
          'review-window',
          'review-inspect-source',
          'html-model-view',
          'source-fields',
          'model-settings',
        ].includes(flow.id),
      ),
    },
    {
      'result.review': createReviewOperation({ client }),
      'json.encode': createJsonEncodingOperation(discoveryProfile.engine.maxJsonDepth),
      'text.bytes': createTextBytesOperation(),
      'html.view': createHtmlViewOperation(),
    },
    discoveryProfile.engine,
  );
  for (const value of ['', 'false', 'null', false, 0, null, [], { arbitrary: ['value'] }]) {
    const input = {
      url: 'https://boundary.invalid/',
      instruction: 'Return the original JSON value.',
      resultDataSchema: {},
      dataToReview: value,
      sourceEvidence: [{ format: 'json', url: 'https://boundary.invalid/', document: value }],
      context: {
        limits: discoveryProfile.traversal,
        resources: discoveryProfile.resources,
        visited: ['https://boundary.invalid/'],
        limited: false,
        resourceUrls: ['https://files.invalid/current'],
        resourceRedirects: [
          {
            url: 'https://boundary.invalid/download',
            status: 307,
            location: ['https://files.invalid/current'],
          },
        ],
      },
      profile: discoveryProfile,
    };
    const outcome = await prepared.run(input);
    assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
    const request = requests.at(-1);
    assert(request);
    const ownSchema = request.messages.find(
      (message) => message.role === 'system' && message.content.startsWith('OUTPUT SCHEMA'),
    );
    assert(ownSchema?.content.includes('"accepted"'));
    const data = request.messages.find((message) => message.content.startsWith('DATA TO REVIEW\n'));
    assert(data);
    assert.deepEqual(JSON.parse(data.content.slice('DATA TO REVIEW\n'.length)), value);
    const evidence = request.messages.find((message) =>
      message.content.startsWith('UNTRUSTED SOURCE EVIDENCE\n'),
    );
    assert(evidence);
    assert.deepEqual(JSON.parse(evidence.content.split('\n').slice(3).join('\n')), value);
    assert(
      request.messages.some((message) =>
        message.content.startsWith(
          'RESULT DATA CONTRACT — applies only to DATA TO REVIEW, not your verdict\n',
        ),
      ),
    );
    assert(!data.content.includes('visited'));
    const scope = request.messages.find((message) => message.content.startsWith('LIMIT CONTEXT'));
    assert(scope);
    assert.deepEqual(
      JSON.parse(scope.content.slice(scope.content.indexOf('\n') + 1)),
      input.context,
    );
  }
  const before = requests.length;
  await assert.rejects(
    prepared.run({
      url: 'https://boundary.invalid/',
      instruction: 'Return data.',
      resultDataSchema: {},
      dataToReview: [],
      sourceEvidence: [],
      context: {
        limits: discoveryProfile.traversal,
        resources: discoveryProfile.resources,
        visited: [],
        limited: false,
        resourceUrls: [],
        resourceRedirects: [],
      },
      profile: discoveryProfile,
    }),
  );
  assert.equal(requests.length, before, 'Missing evidence cannot bypass review');
  mode = 'contract';
  requests.length = 0;
  const contract = createResultContractOperation({ client });
  const contractModel = discoveryWorkflow.flows
    .find((step) => step.id === 'declare-contract')
    ?.flow.steps.find((step) => step.id === 'model');
  assert(contractModel && 'input' in contractModel);
  const documentation = z
    .object({ documentation: z.json() })
    .parse(contractModel.input).documentation;
  const outcome = await contract.run(
    {
      instructions: 'Declare an ordinary schema body for the requested value.',
      messages: [{ role: 'user', content: 'INSTRUCTION\nReturn a string.' }],
      settings: discoveryProfile.settings,
      maxInputBytes: discoveryProfile.maxInputBytes,
      documentation,
    },
    { signal: new AbortController().signal },
  );
  assert.deepEqual(
    z.object({ ok: z.literal(true), decision: z.json() }).parse(outcome).decision,
    scalar,
  );
  assert.equal(
    requests.length,
    2,
    'Cortex repairs invalid schema-body grammar at its own boundary',
  );
  assert(
    requests[1]?.messages.some(
      (message) => message.content.includes('type') && message.content.includes('required'),
    ),
  );
  console.log(
    '[pass] result boundary: complete Cortex prompts preserve 8 data/source values, distinguish verdict/data schemas, refuse missing evidence and recover invalid schema-body output',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

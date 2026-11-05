import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { createSearchOperations } from '../src/search/index.js';
import { prepareArtifact } from '../src/index.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import type { Operation, Operations } from '../src/engine/contracts.js';

// These are provider/capability integration checks, not fresh model accuracy tests.
const recordedRejection = await readFile(
  'tests/fixtures/provider-output-recovery/spiegel-output-parse-failed.sse',
  'utf8',
);
const stream = (data: unknown): Response =>
  new Response(
    'data: ' +
      JSON.stringify({
        choices: [
          { index: 0, delta: { content: JSON.stringify({ data }) }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );
const failed = (status: number, code: string): Response =>
  new Response(JSON.stringify({ error: { code, message: 'Offline provider failure' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const observed = z.object({
  ok: z.boolean(),
  decision: z.json().nullable(),
  meta: z.object({
    steps: z.number(),
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), reported: z.boolean() }),
  }),
});
const request = {
  instructions: 'Return the supplied typed result.',
  messages: [{ role: 'user', content: 'Original request, unchanged.' }],
  settings: discoveryProfile.settings,
  maxInputBytes: discoveryProfile.maxInputBytes,
};
const originalFetch = globalThis.fetch;
let checks = 0;
const passed = (name: string): void => {
  checks++;
  console.log('[pass] native integration: ' + name);
};

for (const name of ['search.rank', 'search.rewrite']) {
  const messages: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).hostname, 'api.groq.com');
    messages.push(JSON.parse(String(init?.body)));
    if (messages.length === 1)
      return new Response(recordedRejection, { headers: { 'content-type': 'text/event-stream' } });
    return stream(
      name === 'search.rank' ? { rankedIds: ['source-a'] } : { query: 'alternate wording' },
    );
  };
  const search = createSearchOperations({ author: { apiKey: 'offline-only' } });
  try {
    const operation = search.operations[name];
    assert(operation);
    const result = observed.parse(
      await operation.run(request, { signal: AbortSignal.timeout(10000) }),
    );
    assert(result.ok);
    assert.equal(messages.length, 2);
    assert.equal(result.meta.steps, 2);
    assert.equal(result.meta.usage.reported, false);
    assert.equal(result.meta.usage.inputTokens, 10);
    assert.deepEqual(
      result.decision,
      name === 'search.rank' ? { rankedIds: ['source-a'] } : { query: 'alternate wording' },
    );
    passed(name + ' receives the same configured recovery and owns both attempts');
  } finally {
    search.close();
    globalThis.fetch = originalFetch;
  }
}

for (const mode of [
  'unknown',
  'authentication',
  'measured-then-unknown',
  'fully-measured',
] as const) {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (mode === 'unknown') return failed(400, 'unknown_failure');
    if (mode === 'authentication') return failed(401, 'invalid_api_key');
    if (calls === 1) return stream({ accepted: 'invalid', reason: 'Measured but invalid' });
    return mode === 'measured-then-unknown'
      ? failed(401, 'invalid_api_key')
      : stream({ accepted: true, reason: 'supported' });
  };
  const discovery = createDiscoveryOperations({ author: { apiKey: 'offline-only' } });
  try {
    const operation = discovery.operations['result.review'];
    assert(operation);
    const result = observed.parse(
      await operation.run(request, { signal: AbortSignal.timeout(10000) }),
    );
    if (mode === 'fully-measured') {
      assert(result.ok);
      assert.equal(calls, 2);
      assert.equal(result.meta.usage.inputTokens, 20);
      assert.equal(result.meta.usage.outputTokens, 10);
      assert(result.meta.usage.reported);
    } else {
      assert(!result.ok);
      assert(!result.meta.usage.reported);
      assert.equal(calls, mode === 'measured-then-unknown' ? 2 : 1);
      assert.equal(result.meta.usage.inputTokens, mode === 'measured-then-unknown' ? 10 : 0);
      assert.equal(result.meta.usage.outputTokens, mode === 'measured-then-unknown' ? 5 : 0);
    }
    passed('usage availability and known totals: ' + mode);
  } finally {
    discovery.close();
    globalThis.fetch = originalFetch;
  }
}

{
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return failed(400, 'unknown_failure');
  };
  const discovery = createDiscoveryOperations({ author: { apiKey: 'offline-only' } });
  try {
    const operation = discovery.operations['result.review'];
    assert(operation);
    const result = observed.parse(
      await operation.run({ ...request, maxInputBytes: 1 }, { signal: AbortSignal.timeout(10000) }),
    );
    assert(!result.ok);
    assert.equal(calls, 0);
    const cancel = new AbortController();
    cancel.abort(new Error('cancel-native-integration'));
    await assert.rejects(
      operation.run(request, { signal: cancel.signal }),
      /cancel-native-integration/,
    );
    assert.equal(calls, 0);
    passed('input/cancellation controls never dispatch or retry');
  } finally {
    discovery.close();
    globalThis.fetch = originalFetch;
  }
}

const web = createWebOperations();
const get = web.operations['http.get'];
assert(get);
let gets = 0,
  modelCalls = 0,
  hostClosed = false;
const getCapability: Operation = {
  inputSchema: structuredClone(get.inputSchema),
  outputSchema: structuredClone(get.outputSchema),
  async run(input) {
    assert(!hostClosed);
    gets++;
    const { url } = z.object({ url: z.string() }).parse(input);
    assert.equal(url, 'https://capability.invalid/records');
    const body = captureBody(
      Buffer.from('<main><article>First</article><article>Second</article></main>'),
    );
    return { url, status: 200, headers: { 'content-type': ['text/html'] }, encoded: body, body };
  },
};
const supplied: Record<string, Operation> = { 'http.get': getCapability };
globalThis.fetch = async (input, init) => {
  assert.equal(new URL(String(input)).hostname, 'api.groq.com');
  modelCalls++;
  const messages = z
    .object({ messages: z.array(z.object({ content: z.string() })) })
    .parse(JSON.parse(String(init?.body))).messages;
  const has = (prefix: string): boolean => messages.some((m) => m.content.startsWith(prefix));
  return stream(
    has('OFFERED RESULT FLOWS\n')
      ? { requiresNavigation: false, resultFlow: null }
      : has('SOURCE AUTHORING CONTEXT\n')
        ? {
            action: 'propose',
            candidate: { selector: 'article', fields: null, links: null, result: null },
          }
        : has('CURRENT MAPPING FEEDBACK\n')
          ? { $pluck: { over: { $ref: '$.input.records' }, key: 'text' } }
          : { accepted: true, reason: 'Both labels present' },
  );
};
const discovery = createDiscoveryOperations({
  author: { apiKey: 'offline-only' },
  mechanical: supplied,
});
try {
  // Factory ownership must survive caller mutation of both registry and descriptor.
  supplied['http.get'] = {
    ...get,
    async run() {
      throw Error('Mutable registry was consulted');
    },
  };
  getCapability.inputSchema['required'] = ['unavailable'];
  const artifact = await prepareArtifact(discoveryWorkflow, discovery.operations, discovery.limits);
  const result = await artifact.run({
    url: 'https://capability.invalid/records',
    instruction: 'Return all labels.',
    outputSchema: { type: 'array', items: { type: 'string' } },
    allowLinkFollowing: false,
    linkDepth: 0,
    maxPages: 1,
  });
  assert.equal(result.status, 'completed', JSON.stringify(result));
  const value = z
    .object({
      status: z.literal('ready'),
      artifact: z.json(),
      trial: z.object({ value: z.object({ data: z.json() }) }),
    })
    .parse(result.value);
  assert.deepEqual(value.trial.value.data, ['First', 'Second']);
  assert.equal(gets, 2);
  const beforeModels = modelCalls;
  const mechanical: Operations = {
    ...web.operations,
    'http.get': discovery.operations['http.get'] ?? get,
  };
  const replay = await (
    await prepareArtifact(value.artifact, mechanical)
  ).run({ url: 'https://capability.invalid/records' });
  assert.equal(replay.status, 'completed');
  assert.deepEqual(z.object({ data: z.json() }).parse(replay.value).data, ['First', 'Second']);
  assert.equal(gets, 3);
  assert.equal(modelCalls, beforeModels);
  passed('one owned host capability serves acquisition, preparation/trial and AI-free execution');
  const sourceOperation = discovery.operations['http.get'];
  assert(sourceOperation);
  const controller = new AbortController();
  controller.abort(new Error('cancel-borrowed-capability'));
  const prepared = await prepareArtifact(value.artifact, mechanical);
  await assert.rejects(
    prepared.run({ url: 'https://capability.invalid/records' }, { signal: controller.signal }),
  );
  assert.equal(gets, 3);
  discovery.close();
  await sourceOperation.run(
    { url: 'https://capability.invalid/records' },
    { signal: AbortSignal.timeout(10000) },
  );
  assert.equal(gets, 4);
  assert.equal(hostClosed, false);
  hostClosed = true;
  passed('cancellation prevents capability work; factory close does not close host resources');
} finally {
  discovery.close();
  web.close();
  globalThis.fetch = originalFetch;
}

console.log(`Native integration: ${checks}/${checks} offline groups; zero paid calls.`);

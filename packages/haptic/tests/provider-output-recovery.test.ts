import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { readOutputRejection } from '../src/discovery/output-rejection.js';
import { SignalError, ErrorCode } from '@niscorp/signal';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import { createTrialOperation } from '../src/discovery/trial.js';

// Recorded provider pathology; all HTTP/model responses below are offline fixtures.
const savedFailure = await readFile(
  'tests/fixtures/provider-output-recovery/spiegel-output-parse-failed.sse',
  'utf8',
);
const originalFetch = globalThis.fetch;
const requestSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
});
type Messages = z.output<typeof requestSchema>['messages'];
const response = (data: unknown): Response =>
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
const rejected = (code = 'output_parse_failed', status = 400, prefix = ''): Response =>
  new Response(
    prefix +
      'data: ' +
      JSON.stringify({
        error: {
          code,
          status_code: status,
          message: 'Rejected generation',
          failed_generation: '{"data":{"accepted":true,"reason":"must never become an answer"}}',
        },
      }) +
      '\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );
const request = {
  instructions: 'Return the declared result only.',
  messages: [{ role: 'user', content: 'Original unchanged instruction.' }],
  settings: { ...discoveryProfile.settings, maxSteps: 3 },
  maxInputBytes: discoveryProfile.maxInputBytes,
};
const checks: string[] = [];
const passed = (name: string): void => {
  checks.push(name);
  console.log('[pass] provider output recovery: ' + name);
};
const parsedResult = z.object({
  ok: z.boolean(),
  decision: z.json().nullable(),
  error: z.object({ code: z.string() }).nullable(),
  meta: z.object({
    steps: z.number(),
    usage: z.object({ inputTokens: z.number(), reported: z.boolean() }),
  }),
});
const single = async (
  name: string,
  emit: (attempt: number) => Response | Promise<Response>,
  inspect: (result: z.output<typeof parsedResult>, messages: Messages[]) => void,
  options: {
    settings?: Partial<typeof request.settings>;
    disabled?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<void> => {
  const messages: Messages[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).hostname, 'api.groq.com');
    const body = requestSchema.parse(JSON.parse(String(init?.body)));
    messages.push(body.messages);
    return emit(messages.length);
  };
  const discovery = createDiscoveryOperations({
    author: { apiKey: 'offline' },
    profile: { ...discoveryProfile, ...(options.disabled ? { outputRejections: [] } : {}) },
  });
  try {
    const operation = discovery.operations['result.review'];
    assert(operation);
    const result = parsedResult.parse(
      await operation.run(
        { ...request, settings: { ...request.settings, ...options.settings } },
        { signal: options.signal ?? AbortSignal.timeout(10000) },
      ),
    );
    inspect(result, messages);
    passed(name);
  } finally {
    discovery.close();
    globalThis.fetch = originalFetch;
  }
};

await single(
  'unchanged success sends once',
  () => response({ accepted: true, reason: 'supported' }),
  (result, messages) => {
    assert(result.ok);
    assert.equal(messages.length, 1);
    assert.equal(result.meta.steps, 1);
    assert(result.meta.usage.reported);
  },
);
await single(
  'exact saved SSE error gets a fresh answer in the same Cortex run',
  (n) =>
    n === 1
      ? new Response(savedFailure, { headers: { 'content-type': 'text/event-stream' } })
      : response({ accepted: true, reason: 'supported' }),
  (result, messages) => {
    assert(result.ok);
    assert.equal(messages.length, 2);
    assert.equal(result.meta.steps, 2);
    assert.equal(result.meta.usage.reported, false);
    assert.equal(result.meta.usage.inputTokens, 10);
    assert(
      messages[1]?.some((m) =>
        m.content.includes(discoveryProfile.outputRejections[0]?.evidence ?? 'absent'),
      ),
    );
    assert(
      !messages[1]?.some(
        (m) =>
          m.content.includes('We need to understand the prompt') ||
          m.content.includes('spiegel.de'),
      ),
    );
    assert.deepEqual(messages[1]?.slice(0, messages[0]?.length), messages[0]);
  },
);
await single(
  'repeated rejections stop at existing step cap',
  () => rejected(),
  (result, messages) => {
    assert(!result.ok);
    assert.equal(result.error?.code, 'stopped');
    assert.equal(result.meta.steps, 3);
    assert.equal(messages.length, 3);
    assert(!result.meta.usage.reported);
  },
);
await single(
  'one remaining step cannot acquire another attempt',
  () => rejected(),
  (result, messages) => {
    assert(!result.ok);
    assert.equal(messages.length, 1);
    assert.equal(result.meta.steps, 1);
  },
  { settings: { maxSteps: 1 } },
);
await single(
  'JSON can disable output adaptation',
  () => rejected(),
  (result, messages) => {
    assert(!result.ok);
    assert.equal(result.error?.code, 'model_call_failed');
    assert.equal(messages.length, 1);
  },
  { disabled: true },
);
for (const [code, status] of [
  ['unknown_error', 400],
  ['authentication_error', 401],
  ['output_parse_failed', 401],
] as const)
  await single(
    'unmatched structured error stays terminal: ' + code + '/' + status,
    () => rejected(code, status),
    (result, messages) => {
      assert(!result.ok);
      assert.equal(messages.length, 1);
    },
  );
await single(
  'partial answer and tool deltas cannot become a rejected answer',
  (n) =>
    n === 1
      ? rejected(
          'output_parse_failed',
          400,
          'data: ' +
            JSON.stringify({
              choices: [
                {
                  index: 0,
                  delta: {
                    content: '{"data":{"accepted":true,"reason":"stale"}}',
                    tool_calls: [
                      {
                        index: 0,
                        id: 'stale',
                        type: 'function',
                        function: { name: 'unexpected', arguments: '{"stale":true}' },
                      },
                    ],
                  },
                },
              ],
            }) +
            '\n\n',
        )
      : response({ accepted: false, reason: 'fresh verdict' }),
  (result, messages) => {
    assert(result.ok);
    assert.deepEqual(result.decision, { accepted: false, reason: 'fresh verdict' });
    assert.equal(messages.length, 2);
    assert(!messages[1]?.some((m) => m.content.includes('stale')));
  },
);

for (const timed of [false, true]) {
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (timed) await new Promise((resolve) => setTimeout(resolve, 120));
    else controller.abort(new Error('cancel-output-recovery'));
    return rejected();
  };
  const discovery = createDiscoveryOperations({ author: { apiKey: 'offline' } });
  try {
    const operation = discovery.operations['result.review'];
    assert(operation);
    const pending = operation.run(
      { ...request, settings: { ...request.settings, maxMs: timed ? 60 : 10000 } },
      { signal: controller.signal },
    );
    if (timed) {
      const result = await pending;
      assert(
        z
          .object({
            ok: z.literal(false),
            error: z.object({ code: z.literal('MODEL_TIME_LIMIT') }),
          })
          .safeParse(result).success,
      );
    } else await assert.rejects(pending);
    assert.equal(calls, 1);
    passed(
      timed
        ? 'owned deadline ends the job without recovery or a new allowance'
        : 'cancellation cannot trigger recovery',
    );
  } finally {
    discovery.close();
    globalThis.fetch = originalFetch;
  }
}
assert.equal(
  readOutputRejection(new Error('output_parse_failed'), discoveryProfile.outputRejections),
  null,
);
assert.equal(
  readOutputRejection(
    new SignalError('unknown', ErrorCode.PROVIDER_ERROR, { raw: { code: 'unknown', status: 400 } }),
    discoveryProfile.outputRejections,
  ),
  null,
);
passed('error text alone never selects policy');

const records = '<main><article>Alpha</article><article>Beta</article></main>';
const modelRequests: { job: string; messages: Messages }[] = [],
  attempted = new Map<string, number>();
const rule = {
  action: 'propose',
  candidate: { selector: 'article', fields: null, links: null, result: null },
};
const mapping = { $pluck: { over: { $ref: '$.input.records' }, key: 'text' } };
let pageCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  assert.equal(new URL(url).hostname, 'api.groq.com');
  const { messages } = requestSchema.parse(JSON.parse(String(init?.body)));
  const has = (prefix: string): boolean => messages.some((m) => m.content.startsWith(prefix));
  const job = has('OFFERED RESULT FLOWS\n')
    ? 'task'
    : has('SOURCE AUTHORING CONTEXT\n')
      ? 'source'
      : has('OBSERVED NATIVE INPUT')
        ? 'schema'
        : has('CURRENT MAPPING FEEDBACK\n')
          ? 'mapping'
          : 'review';
  modelRequests.push({ job, messages });
  const attempt = (attempted.get(job) ?? 0) + 1;
  attempted.set(job, attempt);
  if (attempt === 1) return rejected();
  const data =
    job === 'task'
      ? { requiresNavigation: false, resultFlow: null }
      : job === 'source'
        ? rule
        : job === 'schema'
          ? {
              type: 'array',
              description: 'All record labels',
              items: { type: 'string', description: 'Record label' },
            }
          : job === 'mapping'
            ? mapping
            : { accepted: true, reason: 'Both source labels present' };
  return response(data);
};
const discovery = createDiscoveryOperations({ author: { apiKey: 'offline' } });
const web = createWebOperations();
const get = web.operations['http.get'];
assert(get);
const mechanical = {
  ...web.operations,
  'http.get': {
    ...get,
    async run(input: unknown) {
      const { url } = z.object({ url: z.string() }).parse(input);
      assert.equal(url, 'https://offline.example/records');
      pageCalls++;
      const body = captureBody(Buffer.from(records));
      return { url, status: 200, headers: { 'content-type': ['text/html'] }, encoded: body, body };
    },
  },
};
try {
  const operations = {
    ...discovery.operations,
    'http.get': mechanical['http.get'],
    'artifact.trial': createTrialOperation(mechanical, discoveryProfile.trial),
  };
  const prepared = await prepareArtifact(discoveryWorkflow, operations, discovery.limits);
  const result = await prepared.run({
    url: 'https://offline.example/records',
    instruction: 'Return all record labels.',
    allowLinkFollowing: false,
    linkDepth: 0,
    allowResourceFetching: false,
    maxResources: 0,
  });
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(
    z.object({ status: z.string() }).parse(result.value).status,
    'ready',
    JSON.stringify(result),
  );
  const value = z
    .object({
      status: z.literal('ready'),
      artifact: z.json(),
      trial: z.object({ value: z.object({ data: z.json() }) }),
      author: z.object({
        remaining: z.object({
          author: z.object({ steps: z.number() }),
          review: z.object({ steps: z.number() }),
        }),
      }),
      policy: z.object({ allowLinkFollowing: z.literal(false), linkDepth: z.literal(0) }),
    })
    .parse(result.value);
  assert.deepEqual(value.trial.value.data, ['Alpha', 'Beta']);
  assert.deepEqual([...attempted.keys()].sort(), ['mapping', 'review', 'schema', 'source', 'task']);
  assert([...attempted.values()].every((n) => n === 2));
  assert.equal(value.author.remaining.author.steps, discoveryProfile.author.maxModelSteps - 8);
  assert.equal(value.author.remaining.review.steps, discoveryProfile.review.maxModelSteps - 2);
  assert.equal(pageCalls, 2);
  const before = modelRequests.length;
  const replay = await (
    await prepareArtifact(value.artifact, mechanical, discovery.limits)
  ).run({ url: 'https://offline.example/records' });
  assert.equal(replay.status, 'completed');
  assert.deepEqual(z.object({ data: z.json() }).parse(replay.value).data, ['Alpha', 'Beta']);
  assert.equal(modelRequests.length, before);
  assert.equal(pageCalls, 3);
  const directory =
    'data/runs/provider-output-recovery-offline-' +
    new Date().toISOString().replaceAll(/[:.]/g, '-');
  await mkdir(directory, { recursive: true });
  await writeFile(directory + '/requests.json', JSON.stringify(modelRequests, null, 2));
  await writeFile(directory + '/result.json', JSON.stringify(result, null, 2));
  passed(
    'all five production jobs recover and charge the original JSON budgets; artifact execution is AI-free',
  );
} finally {
  discovery.close();
  web.close();
  globalThis.fetch = originalFetch;
}
console.log(
  `Provider output recovery: ${checks.length}/${checks.length} offline groups, zero paid calls.`,
);

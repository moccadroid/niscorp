import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { prepareArtifact } from '../dist/index.js';
import { createWebOperations } from '../dist/operations/index.js';
import { createSearchOperations, searchWorkflow, searchProfile } from '../dist/search/index.js';
import { discoveryProfile } from '../dist/discovery/index.js';
import { createTrialOperation } from '../dist/discovery/trial.js';
import { createSearchRecoveryAdapter } from './search-image-adapters.mjs';

process.loadEnvFile();
const instruction = process.argv[2];
const request = {
  instruction,
  ...(process.env.HAPTIC_AS_OF ? { asOf: process.env.HAPTIC_AS_OF } : {}),
};
assert(
  !process.argv[3],
  'This runner accepts live acquisition only; saved-page substitution is unavailable',
);
assert(instruction, 'Pass the unchanged search instruction');
assert(process.env.GROQ_API_KEY, 'The discovery credential is required');
const directory = resolve(
  'data/runs',
  'search-connected-' + new Date().toISOString().replaceAll(/[:.]/g, '-'),
);
await mkdir(directory, { recursive: true });
const save = (name, value) =>
  writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n');
await save('source-mode.json', {
  searchPageMode: 'fresh-http',
  destinationMode: 'fresh-http',
  models: 'fresh',
});
const controller = new AbortController(),
  calls = [],
  events = [];
await save('input.json', request);
await save('workflow.json', searchWorkflow);
await save('profile.json', searchProfile);
await save('discovery-profile.json', discoveryProfile);
const hashRunInputs = async () =>
  Object.fromEntries(
    await Promise.all(
      [
        ...(
          await Promise.all(
            ['src', 'dist'].map(async (root) =>
              (await readdir(root, { recursive: true }))
                .filter((path) => /\.(ts|js|json)$/.test(path))
                .map((path) => resolve(root, path)),
            ),
          )
        ).flat(),
        'scripts/check-search.mjs',
        'scripts/search-image-adapters.mjs',
        'benchmarks/discovery-support.mjs',
        'pnpm-lock.yaml',
      ].map(async (path) => [
        path.replaceAll('\\', '/'),
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      ]),
    ),
  );
const frozenInputs = await hashRunInputs();
await save('frozen.json', { files: frozenInputs });
const originalFetch = globalThis.fetch;
let execution = false;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input),
    hostname = new URL(url).hostname;
  if (!['api.groq.com', 'api.typesafe.ai'].includes(hostname)) return originalFetch(input, init);
  assert(!execution, 'Model call attempted during mechanical execution');
  const body = JSON.parse(typeof init?.body === 'string' ? init.body : await input.clone().text());
  const provider = hostname === 'api.groq.com' ? 'groq' : 'jev';
  const number = calls.length + 1,
    call = {
      number,
      provider,
      model: body.model,
      purpose: body.assets
        ? 'captcha'
        : body.messages?.some(
              (message) =>
                message.role === 'system' && message.content === searchProfile.ranking.instructions,
            )
          ? 'ranking'
          : 'discovery',
      retryAttempt: new Headers(init?.headers).get('x-stainless-retry-count'),
    };
  calls.push(call);
  try {
    await save(`request-${number}.json`, { url, body });
    const start = performance.now();
    call.startedAt = new Date().toISOString();
    const response = await originalFetch(input, init);
    const text = await response.text();
    await writeFile(resolve(directory, `response-${number}.txt`), text);
    call.status = response.status;
    call.headers = Object.fromEntries(response.headers);
    call.completedAt = new Date().toISOString();
    call.elapsedMs = performance.now() - start;
    const records = text.trim().startsWith('{')
      ? [text]
      : text
          .split('\n')
          .filter((line) => line.startsWith('data: {'))
          .map((line) => line.slice(6));
    for (const record of records) {
      const item = JSON.parse(record),
        usage = item.usage ?? item.x_groq?.usage;
      if (usage) call.usage = usage;
    }
    await save('calls.json', calls);
    console.log(JSON.stringify({ kind: 'model', ...call }));
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    controller.abort(error);
    await save('audit-failure.json', { name: error.name, message: error.message, call });
    throw error;
  }
};
const web = createWebOperations();
let sources = 0;
const get = web.operations['http.get'];
const recordedGet = {
  ...get,
  async run(input, context) {
    const started = performance.now();
    const source = await get.run(input, context);
    try {
      await save(`source-${++sources}.json`, source);
    } catch (error) {
      controller.abort(error);
      throw error;
    }
    console.log(
      JSON.stringify({
        kind: 'http',
        url: source.url,
        status: source.status,
        bytes: source.body.bytes,
        phase: execution ? 'fresh-replay' : 'discovery-or-trial',
        elapsedMs: performance.now() - started,
      }),
    );
    return source;
  },
};
const mechanical = { ...web.operations, 'http.get': recordedGet };
const recovery = process.env.TYPESAFE_API_KEY
  ? createSearchRecoveryAdapter({
      operations: mechanical,
      limits: discoveryProfile.engine,
      directory,
      apiKey: process.env.TYPESAFE_API_KEY,
      save,
    })
  : undefined;
const search = createSearchOperations({
  author: { apiKey: process.env.GROQ_API_KEY },
  recoverSearch: recovery,
  record(event) {
    events.push(event);
  },
});
const operations = {
  ...search.operations,
  'http.get': recordedGet,
  'artifact.trial': createTrialOperation(mechanical, discoveryProfile.trial),
};
const start = performance.now();
console.log('Search evidence: ' + directory);
try {
  const prepared = await prepareArtifact(searchWorkflow, operations, search.limits);
  const outcome = await prepared.run(request, { signal: controller.signal });
  await save('outcome.json', outcome);
  await save('events.json', events);
  await save('calls.json', calls);
  const discoveryMs = performance.now() - start;
  const replays = [];
  execution = true;
  if (outcome.status === 'completed')
    for (const [index, entry] of outcome.value.destinations.entries()) {
      if (entry.status !== 'completed' || !entry.value.artifact) continue;
      const { source, artifact } = entry.value;
      await save(`artifact-${index}.json`, artifact);
      const compiled = await prepareArtifact(artifact, mechanical, search.limits);
      const begun = performance.now();
      const result = await compiled.run({ url: source.url }, { signal: controller.signal });
      await save(`replay-${index}.json`, result);
      replays.push({
        url: source.url,
        status: result.status,
        elapsedMs: performance.now() - begun,
      });
    }
  assert.deepEqual(await hashRunInputs(), frozenInputs, 'Inputs changed during paid batch');
  const summary = {
    instruction,
    searchPageMode: 'fresh-http',
    status: outcome.status,
    error: outcome.status === 'failed' ? outcome.error : null,
    insufficient: outcome.status === 'completed' ? outcome.value.insufficient : null,
    mechanicallyReadySources:
      outcome.status === 'completed' ? outcome.value.successfulSources : null,
    rankings:
      outcome.status === 'completed'
        ? outcome.value.attempts.map(({ query, rankedIds }) => ({ query, rankedIds }))
        : [],
    selected:
      outcome.status === 'completed' ? outcome.value.selected.map((entry) => entry.url) : [],
    destinations:
      outcome.status === 'completed'
        ? outcome.value.destinations.map((entry, index) => ({
            status: entry.status,
            error: entry.error,
            url: entry.value?.source.url ?? outcome.value.selected[index]?.url,
            qualification: entry.value?.status,
            artifact: !!entry.value?.artifact,
            execution: entry.value?.execution?.status,
          }))
        : [],
    requests: calls.length,
    usage: Object.fromEntries(
      ['jev', 'groq'].map((provider) => {
        const own = calls.filter((call) => call.provider === provider),
          reported = own.filter((call) => call.usage);
        return [
          provider,
          {
            requests: own.length,
            reported: reported.length,
            usageComplete: own.length === reported.length,
            inputTokens:
              own.length > 0 && reported.length === 0
                ? null
                : reported.reduce(
                    (sum, call) => sum + (call.usage.prompt_tokens ?? call.usage.input_tokens ?? 0),
                    0,
                  ),
            outputTokens:
              own.length > 0 && reported.length === 0
                ? null
                : reported.reduce(
                    (sum, call) =>
                      sum + (call.usage.completion_tokens ?? call.usage.output_tokens ?? 0),
                    0,
                  ),
          },
        ];
      }),
    ),
    discoveryMs,
    totalMs: performance.now() - start,
    replays,
    executionModelRequests: 0,
  };
  await save('summary.json', summary);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  await save('failure.json', { name: error.name, message: error.message, execution });
  await save('events.json', events);
  await save('calls.json', calls);
  throw error;
} finally {
  search.close();
  web.close();
  globalThis.fetch = originalFetch;
}

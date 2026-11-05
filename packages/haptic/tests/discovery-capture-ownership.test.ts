import assert from 'node:assert/strict';
import { evaluate } from '@niscorp/prism';
import { prepareArtifact } from '../src/index.js';
import { HttpSourceSchema, captureBody, readSourceBody } from '../src/operations/http-source.js';
import acquisition from '../src/discovery/discovery-acquisition.json' with { type: 'json' };
import workflow from '../src/discovery/discovery.json' with { type: 'json' };
import capturedTrial from '../src/discovery/captured-trial.json' with { type: 'json' };
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { z } from 'zod';

const run = async (id: string, input: unknown) => {
  const helper = acquisition.flows.find((flow) => flow.id === id);
  assert(helper);
  const prepared = await prepareArtifact(
    {
      stamp: workflow.stamp,
      flow: helper.flow,
      flows: [],
    },
    {},
  );
  const result = await prepared.run(input);
  if (result.status === 'failed') return { failure: result.error };
  assert.equal(result.status, 'completed');
  return result.value;
};
const source = (
  url: string,
  text: string,
  status = 200,
  headers: Record<string, string[]> = {},
) => {
  const body = captureBody(Buffer.from(text));
  return { url, status, headers, encoded: body, body };
};
const page = source('https://example.invalid/page', '<main>original capture</main>', 200, {
  'content-type': ['text/html'],
});
const other = source('https://example.invalid/other', '<main>other capture</main>');
const identity = { url: page.url, sha256: page.body.sha256 };
const document = {
  url: page.url,
  sourceSha256: page.body.sha256,
  html: '<main>prepared document</main>',
};
const oldOwned = { index: 0, format: 'html', source: identity, document };
const latestOwned = {
  ...oldOwned,
  index: 2,
  document: { ...document, html: '<main>latest owned preparation</main>' },
};
const state = {
  owned: [oldOwned, latestOwned],
  captures: [
    { source: other, redirects: [] },
    { source: page, redirects: [] },
  ],
};
const expectedView = { ...latestOwned, source: page };
assert.deepEqual(await run('level-sources', { ...state, level: { sources: [identity] } }), [
  expectedView,
]);
assert(!acquisition.flows.some((flow) => flow.id === 'frontier-sources'));
assert.deepEqual(
  await run('level-sources', {
    ...state,
    level: { sources: [{ ...identity, sha256: other.body.sha256 }] },
  }),
  { failure: { code: 'CHECK_FAILED', message: 'Check failed: SOURCE_NOT_OWNED' } },
);
assert.deepEqual(
  await run('level-sources', { ...state, level: { sources: [{ ...identity, url: other.url }] } }),
  { failure: { code: 'CHECK_FAILED', message: 'Check failed: SOURCE_NOT_OWNED' } },
);
assert.deepEqual(readSourceBody(page), Buffer.from('<main>original capture</main>'));
assert.equal(state.owned[0]?.source.sha256, page.body.sha256);
assert(!Object.hasOwn(state.owned[0]?.source ?? {}, 'body'));
console.log(
  '[pass] owned-source views require exact frontier URL/hash and restore the latest preparation with original bytes',
);

const unrelated = {
  ...oldOwned,
  index: 1,
  source: { url: other.url, sha256: other.body.sha256 },
  document: { ...document, url: other.url },
};
assert.deepEqual(
  await run('owned-sources', { previous: [oldOwned, unrelated], current: [latestOwned] }),
  [unrelated, { ...latestOwned, index: oldOwned.index }],
);
assert.deepEqual(
  await run('owned-sources', {
    previous: [oldOwned],
    current: [{ ...latestOwned, source: { ...identity, sha256: other.body.sha256 } }],
  }),
  [oldOwned, { ...latestOwned, source: { ...identity, sha256: other.body.sha256 } }],
);
console.log(
  '[pass] a new preparation replaces the same captured identity without discarding unrelated source versions',
);

const redirect = source('https://example.invalid/start', 'redirect evidence', 302, {
  location: ['/page'],
});
const orphan = source('https://example.invalid/alias', 'alias evidence', 301, {
  location: ['/page'],
});
const existing = { source: other, redirects: [] };
const next = { source: page, redirects: [redirect] };
assert.deepEqual(
  await run('merge-captures', {
    previous: [existing],
    acquired: { sources: [next], redirects: [redirect, orphan] },
  }),
  [existing, next, { source: null, redirects: [orphan] }],
);
const differentRedirect = { ...redirect, headers: { location: ['/other'] } };
assert.deepEqual(
  await run('merge-captures', {
    previous: [],
    acquired: { sources: [next], redirects: [redirect, differentRedirect] },
  }),
  [next, { source: null, redirects: [differentRedirect] }],
);
assert.deepEqual(
  await run('source-redirects', { responses: [redirect, orphan] }),
  [redirect, orphan].map((response) => ({
    url: response.url,
    status: response.status,
    headers: response.headers,
    sha256: response.body.sha256,
  })),
);
const responses = capturedTrial.flows[0]?.flow.steps.find((step) => step.id === 'responses');
assert(responses && 'value' in responses);
assert.deepEqual(
  evaluate(responses.value, {
    input: { captures: [existing, next, { source: null, redirects: [orphan] }] },
  }),
  [other, redirect, page, orphan],
);
assert.deepEqual(readSourceBody(orphan), Buffer.from('alias evidence'));
console.log(
  '[pass] orphan redirects stay in the canonical capture owner and captured trials never receive a null HTTP response',
);

const discovery = createDiscoveryOperations({ author: { apiKey: 'unused-offline' } });
let requests = 0;
const getOperation = discovery.operations['http.get'];
assert(getOperation);
const operations = {
  ...discovery.operations,
  'http.get': {
    ...getOperation,
    async run(input: unknown) {
      const { url } = z.object({ url: z.string() }).parse(input);
      assert.equal(url, page.url);
      requests++;
      return page;
    },
  },
};
try {
  const input = {
    frontier: [page.url],
    processed: [],
    acquisition: { sources: [], redirects: [], visited: [], seen: [] },
    owned: [],
    depth: 0,
    task: { requiresNavigation: false, resultFlow: null },
    policy: discoveryProfile.traversal,
    formats: discoveryProfile.formats,
    htmlContext: discoveryProfile.htmlContext,
  };
  const acquire = discoveryWorkflow.flows.find((flow) => flow.id === 'acquire-phase');
  assert(acquire);
  const prepared = await prepareArtifact(
    {
      stamp: workflow.stamp,
      data: workflow.data,
      flow: acquire.flow,
      flows: discoveryWorkflow.flows,
    },
    operations,
    discovery.limits,
  );
  const first = await prepared.run(input);
  assert.equal(first.status, 'completed', JSON.stringify(first));
  assert(first.value && typeof first.value === 'object' && !Array.isArray(first.value));
  const second = await prepared.run({
    ...input,
    acquisition: first.value.acquisition,
    owned: first.value.owned,
  });
  assert.equal(second.status, 'completed', JSON.stringify(second));
  const ownedState = z.object({
    owned: z.array(
      z.object({
        index: z.number(),
        source: z.object({ url: z.string(), sha256: z.string() }).strict(),
        document: z.object({ html: z.string() }),
      }),
    ),
    level: z
      .object({ sources: z.array(z.object({ url: z.string(), sha256: z.string() }).strict()) })
      .loose(),
    acquisition: z.object({
      sources: z.array(z.object({ source: HttpSourceSchema })),
      visited: z.array(z.string()),
      seen: z.array(z.string()),
    }),
  });
  const before = ownedState.parse(first.value),
    after = ownedState.parse(second.value);
  assert.equal(requests, 1);
  assert.equal(after.acquisition.sources.length, 1);
  assert.deepEqual(after.acquisition.visited, [page.url]);
  assert(after.acquisition.seen.includes(page.url));
  assert.deepEqual(after.acquisition, before.acquisition);
  assert(after.acquisition.sources[0]);
  assert.deepEqual(readSourceBody(after.acquisition.sources[0].source), readSourceBody(page));
  assert.equal(after.owned.length, 1);
  assert.equal(after.owned[0]?.index, before.owned[0]?.index);
  assert.deepEqual(after.owned[0]?.source, identity);
  assert.deepEqual(after.level.sources, [identity]);
  assert(after.owned[0]?.document.html.includes('original capture'));
  assert(!JSON.stringify(after.owned).includes(page.body.base64));
  assert(!Object.hasOwn(after.level, 'documents'));
  console.log(
    '[pass] actual acquisition reuses the same captured identity/index with one raw and one prepared owner, without another HTTP request',
  );
} finally {
  discovery.close();
}

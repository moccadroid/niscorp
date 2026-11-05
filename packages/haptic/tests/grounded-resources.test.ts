import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { defineOperation } from '../src/engine/operation.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody, HttpSourceSchema } from '../src/operations/http-source.js';
import mechanical from '../src/discovery/mechanical.json' with { type: 'json' };
import capturedResources from '../src/discovery/grounded-resources.json' with { type: 'json' };
import defaults from '../src/discovery/default-profile.json' with { type: 'json' };

const origin = 'https://captured-resources.invalid';
const source = (url: string, status = 200, location?: string) => {
  const body = captureBody(Buffer.from(status === 200 ? '%PDF-1.7\nresource\n' : 'redirect'));
  return {
    url,
    status,
    headers: {
      'content-type': [status === 200 ? 'application/pdf' : 'text/html'],
      ...(location === undefined ? {} : { location: [location] }),
    },
    body,
    encoded: body,
  };
};
const available = new Map([
  [origin + '/alias', source(origin + '/alias', 302, '/file.pdf')],
  [origin + '/file.pdf', source(origin + '/file.pdf')],
  [origin + '/second.pdf', source(origin + '/second.pdf')],
  [origin + '/third.pdf', source(origin + '/third.pdf')],
]);
const requested: string[] = [];
const web = createWebOperations();
const operations = {
  ...web.operations,
  'http.get': defineOperation({
    input: z.object({ url: z.url() }).strict(),
    output: HttpSourceSchema,
    run(input) {
      requested.push(input.url);
      const response = available.get(input.url);
      assert(response, 'Unexpected resource request: ' + input.url);
      return response;
    },
  }),
};
const acquisitionSchema = z.object({
  sources: z.array(z.object({ source: HttpSourceSchema, redirects: z.array(HttpSourceSchema) })),
  visited: z.array(z.string()),
  seen: z.array(z.string()),
  redirects: z.array(HttpSourceSchema),
  limited: z.boolean().optional(),
});
const empty = { sources: [], visited: [], seen: [], redirects: [] };
const policy = {
  ...defaults.resources,
  allowResourceFetching: true,
  maxResources: 2,
  accept: { statuses: [200], mediaTypes: ['application/pdf'] },
};
const pages = (...references: string[]) => [
  {
    url: origin + '/list',
    baseUrl: origin + '/list',
    encoding: 'utf-8',
    items: references.map((href) => ({ attributes: { href } })),
    result: {
      flow: { id: 'fetch-resources', revision: 1 },
      input: { reference: ['attributes', 'href'] },
    },
  },
];
const artifact = {
  stamp: mechanical.stamp,
  flows: [...mechanical.flows, ...capturedResources.flows],
  flow: {
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    steps: [
      {
        id: 'resources',
        call: { flow: { id: 'acquire-captured-resources', revision: 1 } },
        input: { $ref: '$.input' },
      },
    ],
    output: { $ref: '$.steps.resources.value' },
  },
};

try {
  const prepared = await prepareArtifact(artifact, operations, defaults.engine);
  const first = await prepared.run({ pages: pages('/alias'), acquisition: empty, policy });
  assert.equal(first.status, 'completed', JSON.stringify(first));
  const acquired = acquisitionSchema.parse(first.value);
  assert.deepEqual(requested, [origin + '/alias', origin + '/file.pdf']);
  assert.deepEqual(acquired.visited, [origin + '/alias']);
  assert(acquired.seen.includes(origin + '/file.pdf'));
  assert.equal(acquired.sources.length, 1);
  assert.equal(acquired.redirects.length, 1);

  const cached = await prepared.run({ pages: pages('/file.pdf'), acquisition: acquired, policy });
  assert.equal(cached.status, 'completed', JSON.stringify(cached));
  const cachedState = acquisitionSchema.parse(cached.value);
  assert.equal(requested.length, 2);
  assert.deepEqual(cachedState.visited, acquired.visited);
  assert.equal(cachedState.limited, false);

  const second = await prepared.run({
    pages: pages('/second.pdf', '/file.pdf'),
    acquisition: cachedState,
    policy,
  });
  assert.equal(second.status, 'completed', JSON.stringify(second));
  const secondState = acquisitionSchema.parse(second.value);
  assert.equal(requested.length, 3);
  assert.deepEqual(secondState.visited, [origin + '/alias', origin + '/second.pdf']);
  assert.equal(secondState.sources.length, 2);

  const exhausted = await prepared.run({
    pages: pages('/third.pdf'),
    acquisition: secondState,
    policy,
  });
  assert.equal(exhausted.status, 'completed', JSON.stringify(exhausted));
  const exhaustedState = acquisitionSchema.parse(exhausted.value);
  assert.equal(requested.length, 3);
  assert.equal(exhaustedState.limited, true);
  assert.deepEqual(exhaustedState.sources, secondState.sources);
  console.log('[pass] captured resources: aliases and charges persist across revised proposals');

  const forbidden = await prepared.run({
    pages: pages('/third.pdf'),
    acquisition: empty,
    policy: { ...policy, allowResourceFetching: false },
  });
  assert.equal(forbidden.status, 'failed');
  assert.equal(requested.length, 3);
  await assert.rejects(
    prepared.run({ pages: pages('/third.pdf'), acquisition: { ...empty, visited: 1 }, policy }),
  );
  assert.equal(requested.length, 3);
  const cancelled = new AbortController();
  cancelled.abort(new Error('cancelled resource acquisition'));
  await assert.rejects(
    prepared.run(
      { pages: pages('/third.pdf'), acquisition: empty, policy },
      { signal: cancelled.signal },
    ),
  );
  assert.equal(requested.length, 3);
  console.log('[pass] captured resources: permissions, schemas and cancellation prevent effects');
} finally {
  web.close();
}

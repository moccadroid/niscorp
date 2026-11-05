import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { ArtifactSchema } from '../src/engine/schema.js';
import { defineOperation } from '../src/engine/operation.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody, HttpSourceSchema } from '../src/operations/http-source.js';
import { createTrialOperation } from '../src/discovery/trial.js';
import { blueprint } from '../src/discovery/blueprint.js';
import {
  CapturedTrialInputSchema,
  CapturedTrialOutputSchema,
} from '../src/discovery/captured-trial.schema.js';
import captured from '../src/discovery/captured-trial.json' with { type: 'json' };
import defaults from '../src/discovery/default-profile.json' with { type: 'json' };

const origin = 'https://captured.invalid';
const start = origin + '/start';
const target = origin + '/list';
const download = origin + '/download';
const terminal = origin + '/report.pdf';
const source = (url: string, text: string, mediaType: string, status = 200, location?: string) => {
  const body = captureBody(Buffer.from(text));
  return {
    url,
    status,
    headers: { 'content-type': [mediaType], ...(location ? { location: [location] } : {}) },
    body,
    encoded: body,
  };
};
const page = source(target, '<main><a href="/download">Grüße report</a></main>', 'text/html');
const redirect = source(start, '', 'text/html', 302, '/list');
const resource = source(terminal, '%PDF-1.7\nactual captured bytes', 'application/pdf');
const resourceRedirect = source(download, '', 'text/html', 307, '/report.pdf');
const captures = [
  { source: page, redirects: [redirect] },
  { source: resource, redirects: [resourceRedirect] },
];
const saved = structuredClone(captures);
const resources = {
  allowResourceFetching: true,
  maxResources: 1,
  maxRedirects: 1,
  stripFragments: true,
  accept: { statuses: [200], mediaTypes: ['application/pdf'] },
};
const makeArtifact = (remaining = 1) =>
  ArtifactSchema.parse({
    stamp: captured.stamp,
    data: { retained: { literal: 'unchanged' } },
    flows: blueprint.flows,
    flow: {
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string', format: 'uri' } },
        required: ['url'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object' },
      steps: [
        {
          id: 'page',
          call: { flow: { id: 'fetch', revision: 2 } },
          input: {
            url: { $ref: '$.input.url' },
            remaining,
            seen: [],
            accept: { statuses: [200], mediaTypes: ['text/html'] },
          },
        },
        {
          id: 'selection',
          call: { operation: 'html.select' },
          input: { source: { $ref: '$.steps.page.value.source' }, selector: 'main a' },
        },
        {
          id: 'resources',
          call: { flow: { id: 'fetch-resources', revision: 1 } },
          input: {
            pages: [
              {
                baseUrl: { $ref: '$.steps.selection.value.baseUrl' },
                encoding: { $ref: '$.steps.selection.value.encoding' },
                items: { $ref: '$.steps.selection.value.items' },
                result: {
                  flow: { id: 'fetch-resources', revision: 1 },
                  input: { reference: ['attributes', 'href'] },
                },
              },
            ],
            policy: resources,
          },
        },
      ],
      output: {
        data: {
          $map: {
            over: { $ref: '$.steps.selection.value.items' },
            as: 'item',
            body: { arbitraryCaption: { $get: { from: { $var: 'item' }, path: ['text'] } } },
          },
        },
        resources: { $ref: '$.steps.resources.value' },
        redirects: { $ref: '$.steps.page.value.redirects' },
        literal: { $ref: '$.data.retained' },
      },
    },
  });
const helper = captured.flows[0];
assert(helper);
const inputSchema = z.toJSONSchema(CapturedTrialInputSchema);
const outputSchema = z.toJSONSchema(CapturedTrialOutputSchema);
const root = ArtifactSchema.parse({
  stamp: captured.stamp,
  flows: [{ ...helper, flow: { ...helper.flow, inputSchema, outputSchema } }],
  flow: {
    inputSchema,
    outputSchema,
    steps: [
      {
        id: 'captured',
        call: { flow: { id: 'captured-trial', revision: 1 } },
        input: { $ref: '$.input' },
      },
    ],
    output: { $ref: '$.steps.captured.value' },
  },
});
const web = createWebOperations();
let calls = 0;
const blockedHttp = defineOperation({
  input: z.object({ url: z.string() }).strict(),
  output: HttpSourceSchema,
  run() {
    calls++;
    throw new Error('CAPTURED_TRIAL_MUST_NOT_FETCH');
  },
});
const mechanical = { ...web.operations, 'http.get': blockedHttp };
const trial = createTrialOperation(mechanical, defaults.engine);
const prepared = await prepareArtifact(
  root,
  { ...mechanical, 'artifact.trial': trial },
  defaults.engine,
);
const run = async (artifact: unknown, owned = captures, url = start) => {
  const outcome = await prepared.run({ artifact, captures: owned, url });
  assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
  return CapturedTrialOutputSchema.parse(outcome.value).outcomes[0];
};

try {
  const artifact = makeArtifact();
  const original = structuredClone(artifact);
  const result = await run(artifact);
  assert.equal(result?.status, 'completed', JSON.stringify(result));
  const value = z
    .object({
      data: z.array(z.object({ arbitraryCaption: z.string() })),
      resources: z.object({
        items: z.array(
          z.object({ source: HttpSourceSchema, redirects: z.array(HttpSourceSchema) }),
        ),
        redirects: z.array(HttpSourceSchema),
      }),
      redirects: z.array(HttpSourceSchema),
      literal: z.json(),
    })
    .parse(result?.value);
  assert.deepEqual(value.data, [{ arbitraryCaption: 'Grüße report' }]);
  assert.deepEqual(value.resources.items, [{ source: resource, redirects: [resourceRedirect] }]);
  assert.deepEqual(value.resources.redirects, [resourceRedirect]);
  assert.deepEqual(value.redirects, [redirect]);
  assert.deepEqual(value.literal, { literal: 'unchanged' });
  assert.deepEqual(artifact, original);
  assert.deepEqual(captures, saved);
  assert.equal(JSON.stringify(artifact).includes(page.body.base64), false);
  assert.equal(calls, 0);

  const responses = new Map(
    captures
      .flatMap((capture) => [...capture.redirects, capture.source])
      .map((response) => [response.url, response]),
  );
  const ordinaryHttp = defineOperation({
    input: z.object({ url: z.string() }).strict(),
    output: HttpSourceSchema,
    run({ url }) {
      const response = responses.get(url);
      assert(response, 'missing fixture response');
      return response;
    },
  });
  const ordinary = await (
    await prepareArtifact(
      artifact,
      { ...web.operations, 'http.get': ordinaryHttp },
      defaults.engine,
    )
  ).run({ url: start });
  assert.deepEqual(
    result && { status: result.status, value: result.value, error: result.error },
    ordinary,
  );
  console.log(
    '[pass] captured trial: complete unchanged parser/program/resource execution equals ordinary transport execution, with zero HTTP',
  );

  for (const [name, currentArtifact, owned] of [
    ['missing resource', artifact, [captures[0]]],
    ['missing page', artifact, [captures[1]]],
    ['redirect budget', makeArtifact(0), captures],
    [
      'resource status',
      artifact,
      [captures[0], { source: { ...resource, status: 403 }, redirects: [resourceRedirect] }],
    ],
    [
      'resource media',
      artifact,
      [
        captures[0],
        {
          source: { ...resource, headers: { 'content-type': ['text/html'] } },
          redirects: [resourceRedirect],
        },
      ],
    ],
  ] as const) {
    const input = CapturedTrialInputSchema.parse({
      artifact: currentArtifact,
      captures: owned,
      url: start,
    });
    const outcome = await prepared.run(input);
    assert.equal(outcome.status, 'completed', name + ': ' + JSON.stringify(outcome));
    const failed = CapturedTrialOutputSchema.parse(outcome.value).outcomes[0];
    assert.equal(failed?.status, 'failed', name + ': ' + JSON.stringify(failed));
    assert(failed.error, name);
    assert.equal(calls, 0, name);
  }
  console.log(
    '[pass] captured trial: missing captures and transport-policy violations remain explicit failures without fallback HTTP',
  );

  for (const fixture of [
    {
      type: 'application/json',
      text: '{"arbitrary":[1,null,false]}',
      operation: 'json.read',
      arguments: {},
      expected: { url: target, document: { arbitrary: [1, null, false] } },
    },
    {
      type: 'application/xml',
      text: '<q:items xmlns:q="urn:items"><q:item>12</q:item></q:items>',
      operation: 'xml.select',
      arguments: {
        rule: {
          selector: '/a:items/a:item',
          namespaces: { a: 'urn:items' },
          fields: { arbitrary: 'string(.)' },
        },
      },
      expected: { url: target, items: [{ arbitrary: '12' }] },
    },
  ]) {
    const documentArtifact = ArtifactSchema.parse({
      stamp: captured.stamp,
      flows: blueprint.flows,
      flow: {
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url'],
          additionalProperties: false,
        },
        outputSchema: { type: 'object' },
        steps: [
          {
            id: 'page',
            call: { flow: { id: 'fetch', revision: 2 } },
            input: {
              url: { $ref: '$.input.url' },
              remaining: 0,
              seen: [],
              accept: { statuses: [200], mediaTypes: [fixture.type] },
            },
          },
          {
            id: 'read',
            call: { operation: fixture.operation },
            input: { source: { $ref: '$.steps.page.value.source' }, ...fixture.arguments },
          },
        ],
        output: { $ref: '$.steps.read.value' },
      },
    });
    const outcome = await run(
      documentArtifact,
      [{ source: source(target, fixture.text, fixture.type), redirects: [] }],
      target,
    );
    assert.equal(outcome?.status, 'completed', JSON.stringify(outcome));
    assert.deepEqual(outcome.value, fixture.expected);
    assert.equal(calls, 0);
  }
  console.log(
    '[pass] captured trial: original JSON and namespaced XML use their ordinary readers without conversion or HTTP',
  );

  const changedPolicy = structuredClone(artifact);
  const changedFetch = changedPolicy.flows.find(
    (entry) => entry.id === 'fetch' && entry.revision === 2,
  );
  assert(changedFetch);
  changedFetch.flow.steps.push({
    id: 'future-policy',
    value: false,
    checks: [{ id: 'future-source-policy', test: { $ref: '$.value' } }],
  });
  const enforced = await run(changedPolicy);
  assert.equal(enforced?.status, 'failed');
  assert(
    z
      .object({ message: z.string() })
      .parse(enforced.error)
      .message.includes('future-source-policy'),
  );
  for (const change of ['missing', 'duplicate', 'operation', 'input'] as const) {
    const malformed = structuredClone(artifact);
    const fetch = malformed.flows.find((entry) => entry.id === 'fetch' && entry.revision === 2);
    assert(fetch);
    const pageStep = fetch.flow.steps.find((step) => step.id === 'page');
    assert(pageStep && 'call' in pageStep);
    if (change === 'missing')
      fetch.flow.steps = fetch.flow.steps.filter((step) => step.id !== 'page');
    if (change === 'duplicate') fetch.flow.steps.push(structuredClone(pageStep));
    if (change === 'operation') pageStep.call = { operation: 'other.get' };
    if (change === 'input') pageStep.input = { url: { $ref: '$.input.url' }, headers: {} };
    const refused = await prepared.run({ artifact: malformed, captures, url: start });
    assert.equal(refused.status, 'failed', change + ': ' + JSON.stringify(refused));
    assert(refused.error?.message.includes('captured-trial-'), change);
  }
  await assert.rejects(
    prepared.run({ artifact, captures, url: 'ftp://captured.invalid/list' }),
    z.ZodError,
  );
  assert.equal(calls, 0);
  console.log(
    '[pass] captured trial: future fetch policy propagates directly; unsupported acquisition bindings/protocols are refused before HTTP',
  );
} finally {
  web.close();
}

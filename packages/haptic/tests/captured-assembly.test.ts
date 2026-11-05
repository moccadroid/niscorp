import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { defineOperation } from '../src/engine/operation.js';
import type { JsonValue, Operations } from '../src/engine/contracts.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody, HttpSourceSchema } from '../src/operations/http-source.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { blueprint } from '../src/discovery/blueprint.js';
import { createTrialOperation } from '../src/discovery/trial.js';
import { capturedSources } from './helpers/captured-sources.js';

const url = 'https://assembly.invalid/list';
const pdfUrl = 'https://assembly.invalid/report.pdf';
const source = (url: string, text: string, mediaType: string) => {
  const body = captureBody(Buffer.from(text));
  return { url, status: 200, headers: { 'content-type': [mediaType] }, body, encoded: body };
};
const page = source(url, '<main><a href="/report.pdf">True source caption</a></main>', 'text/html');
const pdf = source(pdfUrl, '%PDF-1.7\nReal bytes', 'application/pdf');
const outputSchema = { type: 'array', items: { type: 'string' } };
const flow = { id: 'fetch-resources', revision: 1 };
const profile = {
  ...discoveryProfile,
  resources: { ...discoveryProfile.resources, allowResourceFetching: true, maxResources: 1 },
};
const rule = {
  selector: 'main a',
  fields: null,
  links: null,
  preconditions: [],
  result: { flow, input: { reference: ['attributes', 'href'] } },
};
const assemblyInput = {
  url,
  blueprint,
  policy: profile.traversal,
  formats: profile.formats,
  resources: profile.resources,
  minimumResultMatches: profile.minimumResultMatches,
  task: { requiresNavigation: false, resultFlow: flow },
  levels: [
    {
      depth: 0,
      format: 'html',
      standalone: false,
      reference: false,
      frontier: [url],
      sources: [{ url, sha256: page.body.sha256 }],
      redirects: [],
      ready: true,
      rule,
      trials: [
        {
          id: 'source-trial',
          status: 'completed',
          value: {
            source: { url },
            selection: {
              baseUrl: url,
              encoding: 'utf-8',
              items: [
                { text: 'FAKE PRIOR PROJECTION', attributes: { href: '/report.pdf' }, path: [0] },
              ],
            },
            urls: [],
          },
          error: null,
        },
      ],
    },
  ],
  owned: capturedSources([
    {
      format: 'html',
      source: page,
      document: {
        url,
        sha256: page.body.sha256,
        encoding: 'utf-8',
        html: '<main><a href="/report.pdf">True source caption</a></main>',
      },
    },
  ]).owned,
  captures: [{ source: page, redirects: [] }],
  resourceAcquisition: { sources: [], redirects: [], seen: [], visited: [], limited: false },
};
const web = createWebOperations();
const discovery = createDiscoveryOperations({ author: { apiKey: 'unused-offline' }, profile });
const gets: string[] = [];
const http = defineOperation({
  input: z.object({ url: z.string() }).strict(),
  output: HttpSourceSchema,
  run(input) {
    gets.push(input.url);
    assert.equal(input.url, pdfUrl, 'Owned page must not be fetched during captured trials');
    return pdf;
  },
});
let selections = 0;
const htmlSelect = web.operations['html.select'];
assert(htmlSelect);
const countedSelect = {
  ...htmlSelect,
  async run(input: JsonValue, context: Parameters<typeof htmlSelect.run>[1]) {
    selections++;
    return htmlSelect.run(input, context);
  },
};
const mechanical: Operations = {
  ...web.operations,
  'http.get': http,
  'html.select': countedSelect,
};
const operations = {
  ...discovery.operations,
  ...mechanical,
  'artifact.trial': createTrialOperation(mechanical, discovery.limits),
};
const runHelper = async (id: string, input: unknown) => {
  const prepared = await prepareArtifact(
    {
      ...discoveryWorkflow,
      flow: {
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        steps: [{ id: 'helper', call: { flow: { id, revision: 1 } }, input: { $ref: '$.input' } }],
        output: { $ref: '$.steps.helper.value' },
      },
    },
    operations,
    discovery.limits,
  );
  const result = await prepared.run(input);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  return z.record(z.string(), z.json()).parse(result.value);
};

try {
  const assembled = await runHelper('assemble-state', assemblyInput);
  assert.equal(assembled.reason, null, JSON.stringify(assembled.reason));
  const nativeInput = z
    .object({
      data: z.object({
        records: z.array(z.object({ text: z.string() })),
        resourceUrls: z.array(z.url()),
      }),
      meta: z.json(),
    })
    .parse(assembled.nativeInput);
  assert.equal(nativeInput.data.records[0]?.text, 'True source caption');
  assert.deepEqual(nativeInput.data.resourceUrls, [pdfUrl]);
  assert(!JSON.stringify(nativeInput.data).includes('FAKE PRIOR PROJECTION'));
  assert(!JSON.stringify(nativeInput.data).includes('base64'));
  assert.deepEqual(gets, [pdfUrl]);
  const before = selections;

  const mapping = {
    $map: {
      over: { $ref: '$.input.records' },
      as: 'item',
      body: { $get: { from: { $var: 'item' }, path: ['text'] } },
    },
  };
  const observationInput = {
    sourceArtifact: assembled.sourceArtifact,
    sourceFlow: assembled.sourceFlow,
    shapedFlow: blueprint.execution.shaped,
    schema: outputSchema,
    url,
    captures: [
      ...assemblyInput.captures,
      ...z.object({ sources: z.array(z.json()) }).parse(assembled.resourceAcquisition).sources,
    ],
    partialTrial: null,
  };
  const observed = await runHelper('observe-output', { ...observationInput, mapping });
  const captured = z
    .object({
      status: z.literal('completed'),
      value: z.object({
        data: z.array(z.string()),
        resources: z.object({ items: z.array(z.object({ source: HttpSourceSchema })) }),
      }),
    })
    .parse(observed.capturedTrial);
  assert.deepEqual(captured.value.data, ['True source caption']);
  assert.deepEqual(captured.value.resources.items[0]?.source, pdf);
  const partial = z
    .object({ outputSchema: z.json(), outcome: z.json() })
    .parse(observed.partialTrial);
  assert.deepEqual(partial.outcome, observed.capturedTrial);
  assert.deepEqual(partial.outputSchema, outputSchema);
  assert(!JSON.stringify(observed.feedback).includes('base64'));
  assert.deepEqual(gets, [pdfUrl]);
  assert(selections > before, 'The assembled shaped artifact must execute its actual selection');
  const projected = await runHelper('observe-output', {
    ...observationInput,
    mapping: { $ref: '$.input.resourceUrls' },
  });
  assert.deepEqual(
    z.object({ value: z.object({ data: z.array(z.string()) }) }).parse(projected.capturedTrial)
      .value.data,
    nativeInput.data.resourceUrls,
    'Captured mapping and emitted shaping helper must receive the same acquired URLs',
  );
  assert.deepEqual(gets, [pdfUrl], 'Projection cannot reacquire resources');

  const withoutResources = await runHelper('output-source', {
    pages: [],
    visited: [url],
    limited: false,
    redirects: [],
  });
  assert.deepEqual(
    z.object({ data: z.object({ resourceUrls: z.array(z.url()) }) }).parse(withoutResources).data
      .resourceUrls,
    [],
  );
  await assert.rejects(
    runHelper('output-source', {
      pages: [],
      visited: [url],
      limited: false,
      resources: { items: [{ source: { url: 'not a URL' } }] },
    }),
    { code: 'INVALID_VALUE' },
  );
  assert.deepEqual(gets, [pdfUrl], 'Invalid projections fail without HTTP or models');
  console.log(
    '[pass] captured assembly: real complete source/shaped trials, bounded resource capture, exact partial outcome and byte-free model observations',
  );
} finally {
  discovery.close();
  web.close();
}
